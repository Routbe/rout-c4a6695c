import { sql } from "./neon";
import { assertVerifiedOwner, hasReciprocalLink, mastodonProfileSchema, type FediverseIdentity } from "./fediverse-profile";
import { validateOutboundUrl } from "./security/ssrf-guard.server";
import { activeSubdomainFor, type SubdomainTier } from "./subdomain.server";
import { enforceRateLimit } from "./rate-limit.server";

async function binding(userId: string) {
  const rows = await sql`select p.username, p.subdomain_alias, p.subdomain_enabled, p.subdomain_tier,
    p.root_subdomain_status, u.email_confirmed_at from public.profiles p join public.users u on u.id=p.id where p.id=${userId} limit 1`;
  const row = rows[0];
  if (!row?.email_confirmed_at || !row.username) return null;
  const handle = String(row.username);
  const urls = [`https://rout.be/@${handle}`, `https://rout.be/${handle}`];
  const subdomain = activeSubdomainFor({ username: handle, alias: typeof row.subdomain_alias === "string" ? row.subdomain_alias : null, tier: (row.subdomain_tier ?? "free") as SubdomainTier, rootStatus: typeof row.root_subdomain_status === "string" ? row.root_subdomain_status : "none" });
  if (row.subdomain_enabled && subdomain) urls.push(`https://${subdomain}`);
  const domains = await sql`select domain from public.custom_domains where user_id=${userId} and status='verified'`;
  for (const domain of domains) urls.push(`https://${domain.domain}`);
  urls.sort();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(urls)));
  const token = `relme:${Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("")}`;
  return { urls, token };
}

async function readHtml(response: Response): Promise<string> {
  if (!response.ok || !(response.headers.get("content-type") ?? "").toLowerCase().includes("text/html")) throw new Error("profile_unavailable");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("profile_unavailable");
  const decoder = new TextDecoder(); let html = ""; let size = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 512 * 1024) { await reader.cancel(); throw new Error("profile_too_large"); }
      html += decoder.decode(chunk.value, { stream: true });
    }
    return html + decoder.decode();
  } finally { reader.releaseLock(); }
}

export async function saveFediverseProfile(user: { id: string; emailConfirmedAt: string | null }, raw: string) {
  assertVerifiedOwner(user, user.id);
  const url = mastodonProfileSchema.parse(raw);
  const bound = await binding(user.id);
  if (!bound) throw Object.assign(new Error("Bevestig je e-mailadres en kies een profielnaam."), { statusCode: 403 });
  enforceRateLimit(`fediverse:${user.id}`, 5, 60_000);
  if (!url) {
    await sql`delete from public.user_integrations where user_id=${user.id} and provider='mastodon'`;
    return null;
  }
  // Persist the outbound link first. This makes both profile heads available
  // to Mastodon even while the reciprocal proof is still pending.
  await sql`insert into public.user_integrations (user_id,provider,handle,audience,visible,verified,verified_via,verified_at,verify_code,show_on_verified,show_on_alias)
    values (${user.id},'mastodon',${url},'both',true,false,null,null,${bound.token},true,true)
    on conflict (user_id,provider) do update set handle=excluded.handle,visible=true,verified=false,verified_via=null,verified_at=null,
    verify_code=excluded.verify_code,show_on_verified=true,show_on_alias=true,status_json=null,status_at=null,updated_at=now()`;
  let verified = false;
  try {
    const signal = AbortSignal.timeout(8000);
    const safe = await validateOutboundUrl(url, signal);
    const response = await fetch(safe, { redirect: "error", signal, headers: { accept: "text/html", "user-agent": "ROUT ownership verification" } });
    verified = hasReciprocalLink(await readHtml(response), bound.urls, url);
  } catch { /* fail closed, without logging provider content */ }
  // Re-read ownership after the network wait; handle/domain changes invalidate proof.
  const current = await binding(user.id);
  verified = verified && current?.token === bound.token;
  const saved = await sql`update public.user_integrations set verified=${verified},verified_via=${verified ? "bio" : null},verified_at=${verified ? new Date().toISOString() : null},updated_at=now()
    where user_id=${user.id} and provider='mastodon' and handle=${url} and verify_code=${bound.token} returning handle`;
  return saved[0] ? { url, verified } : null;
}

export async function readFediverseProfile(userId: string): Promise<FediverseIdentity | null> {
  // Anonymous SSR cannot read users behind owner-only RLS. The reviewed SQL
  // capability returns only public proof metadata and currently owned URLs.
  const rows = await sql`select * from public.read_public_fediverse(${userId}::uuid)`;
  const row = rows[0];
  const url = mastodonProfileSchema.safeParse(row?.handle);
  if (!row || !url.success || !url.data || typeof row.verify_code !== "string" || !row.verify_code.startsWith("relme:")) return null;
  if (!Array.isArray(row.urls) || !row.urls.every(value => typeof value === "string")) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([...row.urls].sort())));
  const token = `relme:${Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("")}`;
  // Bounded proof age: an abandoned/deleted remote link never stays verified indefinitely.
  const age = Date.now() - Date.parse(String(row.verified_at ?? ""));
  return { url: url.data, verified: row.verified === true && row.verify_code === token && age >= 0 && age < 86400_000 };
}
/**
 * Everything the Mastodon/GitHub verification form needs: the member's own
 * ROUT addresses (to paste on Mastodon/GitHub) and prefills from sign-in
 * identities or already claimed social accounts.
 */
export async function readVerificationSetup(userId: string) {
  const bound = await binding(userId);
  const urls = new Set<string>(bound?.urls.filter((u) => !u.includes("/@")) ?? []);
  const alias = await sql`select handle from public.alias_profiles where user_id=${userId} and enabled=true limit 1`.catch(() => [] as Record<string, unknown>[]);
  if (alias[0]?.handle) urls.add(`https://rout.be/u/${String(alias[0].handle)}`);
  let sso: Record<string, string> = {};
  try { const { ssoHandles } = await import("./integrations.server"); sso = await ssoHandles(userId); } catch { /* optional */ }
  const claimed = await sql`select platform, username from public.social_links where profile_id=${userId} and platform in ('mastodon','github')`.catch(() => [] as Record<string, unknown>[]);
  const pick = (p: string) => sso[p] ?? (claimed.find((r) => r.platform === p)?.username as string | undefined) ?? null;
  return { urls: [...urls].sort((a, b) => a.length - b.length), mastodonSuggestion: pick("mastodon"), github: pick("github") };
}
