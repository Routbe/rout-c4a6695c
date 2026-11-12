/**
 * Three-tier wildcard-subdomain routing for ROUT.
 *
 *   [alias].u.rout.be   → free tier   (wildcard *.u.rout.be)
 *   [handle].r.rout.be  → pro tier    (wildcard *.r.rout.be)
 *   [handle].rout.be    → root add-on (manual DNS, €39,99 lifetime)
 *
 * Every variant answers `/.well-known/atproto-did` with the raw Bluesky DID so
 * Bluesky can verify the handle, and every other path is *rewritten* (not
 * redirected) to the member's public profile so the subdomain stays visible in
 * the address bar.
 */
import { sql } from "@/lib/neon";

const ROOT_DOMAINS = ["rout.be"];
const SYSTEM_SUBDOMAINS = new Set([
  "www",
  "api",
  "app",
  "admin",
  "mail",
  "cdn",
  "static",
  "preview",
  "dev",
]);

export type SubdomainTier = "free" | "pro" | "root_lifetime";

export interface SubdomainMatch {
  /** Raw subdomain label, e.g. `jona`. */
  label: string;
  /** Which namespace the request arrived on. */
  tier: SubdomainTier;
}

/** Parses the Host header into a subdomain label + the tier it belongs to. */
export function subdomainFromHost(host: string | null): SubdomainMatch | null {
  if (!host) return null;
  const clean = (host.split(":")[0] ?? "").toLowerCase().replace(/\.$/, "");
  const root = ROOT_DOMAINS.find((d) => clean === d || clean.endsWith(`.${d}`));
  if (!root || clean === root) return null;

  const prefix = clean.slice(0, -(root.length + 1));
  if (!prefix) return null;

  if (prefix.endsWith(".u")) {
    const label = prefix.slice(0, -2);
    return label ? { label, tier: "free" } : null;
  }
  if (prefix.endsWith(".r")) {
    const label = prefix.slice(0, -2);
    return label ? { label, tier: "pro" } : null;
  }
  if (prefix.includes(".")) return null; // deeper namespaces are not ours
  if (SYSTEM_SUBDOMAINS.has(prefix)) return null;
  return { label: prefix, tier: "root_lifetime" };
}

/** Handle → profile handle. Dots in a subdomain map to hyphens in the handle. */
export const subdomainToHandle = (sub: string) => sub.replace(/\./g, "-");

type SubProfile = {
  username: string | null;
  subdomain_alias: string | null;
  verified: boolean | null;
  subdomain_enabled: boolean | null;
  subdomain_tier: string | null;
  root_subdomain_status: string | null;
  redirect_target: string | null;
  bluesky_did: string | null;
  bluesky_handle: string | null;
};

type Row = Record<string, unknown>;

/** Looks a profile up by subdomain label (alias or handle). */
export async function lookupSubdomainProfile(sub: string): Promise<SubProfile | null> {
  const handle = subdomainToHandle(sub);
  const rows = (await sql`
    select username, subdomain_alias, verified, subdomain_enabled, subdomain_tier,
           root_subdomain_status, redirect_target, bluesky_did, bluesky_handle
      from public.profiles
     where lower(username) = ${handle} or lower(subdomain_alias) = ${handle}
     limit 1
  `) as Row[];
  return (rows[0] as unknown as SubProfile) ?? null;
}

/** Public profile path for a profile, respecting the free/verified namespace. */
function profilePathFor(profile: SubProfile): string {
  const handle = profile.username ?? profile.subdomain_alias ?? "";
  return profile.verified ? `/${handle}` : `/u/${handle}`;
}

/**
 * Answers `/.well-known/atproto-did` with the raw DID (text/plain, no newline),
 * or 404 "DID not configured".
 */
export async function handleAtprotoDidRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname.replace(/\/+$/, "") !== "/.well-known/atproto-did") return null;

  const match = subdomainFromHost(request.headers.get("host"));
  if (!match) return null;

  let profile: SubProfile | null = null;
  try {
    profile = await lookupSubdomainProfile(match.label);
  } catch {
    profile = null;
  }

  const did = profile?.bluesky_did?.trim();
  const headers = {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  } as const;

  if (!did || !did.startsWith("did:")) {
    return new Response("DID not configured", { status: 404, headers });
  }
  return new Response(did, { status: 200, headers });
}

/**
 * Rewrites a subdomain request to the member's public profile, keeping the
 * subdomain in the browser URL bar. Returns the rewritten Request, or null when
 * the request is not a subdomain request we own.
 */
export async function rewriteSubdomainRequest(request: Request): Promise<Request | null> {
  const url = new URL(request.url);
  const match = subdomainFromHost(request.headers.get("host"));
  if (!match) return null;
  if (url.pathname !== "/") return null;

  let profile: SubProfile | null = null;
  try {
    profile = await lookupSubdomainProfile(match.label);
  } catch {
    return null;
  }
  if (!profile?.username && !profile?.subdomain_alias) return null;
  if (profile.subdomain_enabled === false) return null;
  if (match.tier === "root_lifetime" && profile.root_subdomain_status !== "active") return null;

  if (profile.redirect_target === "bluesky" && profile.bluesky_handle) {
    return null; // handled by handleSubdomainRequest as a 302
  }

  const target = new URL(url.toString());
  target.pathname = profilePathFor(profile);
  return new Request(target.toString(), request);
}

/**
 * Legacy entry point: returns a Response when the request should be answered
 * with a redirect (Bluesky redirect target only).
 */
export async function handleSubdomainRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const match = subdomainFromHost(request.headers.get("host"));
  if (!match || url.pathname !== "/") return null;

  let profile: SubProfile | null = null;
  try {
    profile = await lookupSubdomainProfile(match.label);
  } catch {
    return null;
  }
  if (!profile?.subdomain_enabled) return null;
  if (profile.redirect_target !== "bluesky") return null;

  const handle = profile.bluesky_handle?.trim();
  if (!handle) return null;

  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://bsky.app/profile/${handle}`,
      "Cache-Control": "no-store",
    },
  });
}

export type SubdomainSettings = {
  username: string | null;
  alias: string | null;
  subdomainEnabled: boolean;
  redirectTarget: string;
  blueskyDid: string | null;
  blueskyHandle: string | null;
  tier: SubdomainTier;
  rootStatus: "none" | "pending_dns" | "active";
  /** Bare host (no scheme, no slashes) the member should use on Bluesky. */
  activeSubdomain: string | null;
};

/** Bare active host for a tier — never includes a scheme or a path. */
export function activeSubdomainFor(input: {
  username: string | null;
  alias: string | null;
  tier: SubdomainTier;
  rootStatus: string;
}): string | null {
  const handle = (input.username ?? input.alias ?? "").toLowerCase();
  const alias = (input.alias ?? input.username ?? "").toLowerCase();
  if (!handle && !alias) return null;
  if (input.tier === "root_lifetime" && input.rootStatus === "active") return `${handle}.rout.be`;
  if (input.tier === "root_lifetime" || input.tier === "pro") return `${handle}.r.rout.be`;
  return `${alias}.u.rout.be`;
}

/** Reads the subdomain panel's current state for the signed-in member. */
export async function readSubdomainSettings(userId: string): Promise<SubdomainSettings> {
  const rows = (await sql`
    select username, subdomain_alias, subdomain_enabled, redirect_target,
           bluesky_did, bluesky_handle, subdomain_tier, root_subdomain_status
      from public.profiles
     where id = ${userId}
     limit 1
  `) as Row[];
  const row = rows[0];
  const username = (row?.["username"] as string | null) ?? null;
  const alias = (row?.["subdomain_alias"] as string | null) ?? username;
  const tier = ((row?.["subdomain_tier"] as string | null) ?? "free") as SubdomainTier;
  const rootStatus = ((row?.["root_subdomain_status"] as string | null) ?? "none") as
    "none" | "pending_dns" | "active";

  return {
    username,
    alias,
    subdomainEnabled: Boolean(row?.["subdomain_enabled"]),
    redirectTarget: (row?.["redirect_target"] as string | null) ?? "rout_profile",
    blueskyDid: (row?.["bluesky_did"] as string | null) ?? null,
    blueskyHandle: (row?.["bluesky_handle"] as string | null) ?? null,
    tier,
    rootStatus,
    activeSubdomain: activeSubdomainFor({ username, alias, tier, rootStatus }),
  };
}

/** Autosaves the subdomain toggle + redirect target + Bluesky DID. */
export async function writeSubdomainSettings(
  userId: string,
  input: { enabled: boolean; target: "rout_profile" | "bluesky"; did: string | null },
) {
  await sql`
    update public.profiles
       set subdomain_enabled = ${input.enabled},
           redirect_target = ${input.target},
           bluesky_did = ${input.did && input.did.trim() ? input.did.trim() : null},
           updated_at = now()
     where id = ${userId}
  `;
}

/** Persists the resolved Bluesky handle + DID from wizard step 1. */
export async function writeBlueskyIdentity(userId: string, handle: string, did: string) {
  await sql`
    update public.profiles
       set bluesky_handle = ${handle},
           bluesky_did = ${did},
           updated_at = now()
     where id = ${userId}
  `;
}

/**
 * Claims the root subdomain add-on: flips the tier, parks the DNS status on
 * `pending_dns` and notifies the admin so DNS can be created at Infomaniak.
 */
export async function claimRootSubdomainFor(userId: string): Promise<{
  subdomain: string;
  status: "pending_dns" | "active";
}> {
  const rows = (await sql`
    select username, subdomain_alias, email, full_name, root_subdomain_status, subdomain_tier
      from public.profiles
     where id = ${userId}
     limit 1
  `) as Row[];
  const row = rows[0];
  if (!row) throw new Error("Profiel niet gevonden.");

  const handle = (
    (row["username"] as string | null) ??
    (row["subdomain_alias"] as string | null) ??
    ""
  ).toLowerCase();
  if (!handle) throw new Error("Claim eerst een handle voordat je een root-subdomein aanvraagt.");

  const status = (row["root_subdomain_status"] as string | null) ?? "none";
  const subdomain = `${handle}.rout.be`;
  if (status === "active") return { subdomain, status: "active" };
  // Betaalde add-on: alleen toegestaan als de levenslange tier al door een
  // betaling of een beheerder is toegekend. Nooit op verzoek van de gebruiker.
  if ((row["subdomain_tier"] as string | null) !== "root_lifetime") {
    throw new Error("payment_required");
  }

  await sql`
    update public.profiles
       set root_subdomain_status = 'pending_dns',
           subdomain_enabled = true,
           updated_at = now()
     where id = ${userId}
  `;

  if (status !== "pending_dns") {
    const { sendMail } = await import("@/emails/send.server");
    const adminEmail =
      process.env["ADMIN_EMAIL"] ?? process.env["BREVO_ADMIN_EMAIL"] ?? "admin@rout.be";
    const userEmail = (row["email"] as string | null) ?? "onbekend";
    const userName = (row["full_name"] as string | null) ?? handle;
    const dnsInstruction = `Type: CNAME | Source: ${handle} | Target: cname.vercel-dns.com`;

    void sendMail({
      to: adminEmail,
      templateId: 2,
      subject: `[ROUT] Root-subdomein aangevraagd: ${subdomain}`,
      params: {
        user_name: userName,
        user_email: userEmail,
        requested_subdomain: subdomain,
        dns_instruction: dnsInstruction,
      },
      tags: ["root-subdomain-request"],
      html:
        ((esc) =>
        `<p>Nieuwe root-subdomein aanvraag.</p>` +
        `<ul><li>Naam: ${esc(userName)}</li><li>E-mail: ${esc(userEmail)}</li>` +
        `<li>Subdomein: ${esc(subdomain)}</li><li>DNS: ${esc(dnsInstruction)}</li></ul>`)((v: string) =>
          v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)),
    }).catch((error: unknown) => {
      console.error("[Subdomain] admin notification failed", error);
    });
    const { later, recipient, sendSiteMail, siteOrigin } = await import("./site-mail.server");
    later(async () => {
      const r = await recipient(userId);
      const { subdomainMail } = await import("@/emails/site-mails");
      await sendSiteMail(r.email, subdomainMail({ lang: r.lang, name: r.name, subdomain, stage: "requested", url: `${siteOrigin()}/dashboard` }), ["subdomain", "requested"]);
    });
  }

  return { subdomain, status: "pending_dns" };
}

/**
 * Workspace hosts: <slug>.w.rout.be and <domain>.rout.be. Answers the AT
 * Protocol DID file and rewrites "/" to the public /w/<slug> page. Returns a
 * Response (DID) or a rewritten Request; null when the host is not a workspace.
 */
export async function handleWorkspaceHost(request: Request): Promise<Response | Request | null> {
  const { workspaceFromHost } = await import("./relme-links");
  const match = workspaceFromHost(request.headers.get("host"));
  if (!match) return null;
  const url = new URL(request.url);
  const slugArg = "slug" in match ? match.slug : null;
  const domainArg = "domain" in match ? match.domain : null;
  if (url.pathname.replace(/\/+$/, "") === "/.well-known/atproto-did") {
    const headers = { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" } as const;
    let did: string | null = null;
    try {
      const rows = (await sql`select public.rout_workspace_atproto_did(${slugArg}, ${domainArg}) as did`) as Row[];
      did = (rows[0]?.["did"] as string | null) ?? null;
    } catch { did = null; }
    return did?.startsWith("did:") ? new Response(did, { status: 200, headers }) : new Response("DID not configured", { status: 404, headers });
  }
  if (url.pathname !== "/") return null;
  let slug = slugArg;
  if (!slug && domainArg) {
    try {
      const rows = (await sql`select public.rout_workspace_slug_for_domain(${domainArg}) as slug`) as Row[];
      slug = (rows[0]?.["slug"] as string | null) ?? null;
    } catch { slug = null; }
  }
  if (!slug) return null;
  const target = new URL(url.toString());
  target.pathname = `/w/${slug}`;
  return new Request(target.toString(), request);
}

/** Resolves a Bluesky handle to its DID via the public AT Protocol resolver. */
export async function resolveBlueskyDid(rawHandle: string): Promise<{ handle: string; did: string } | { error: string }> {
  const handle = rawHandle.replace(/\s+/g, "").replace(/^@+/, "").toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(handle)) return { error: "Dat lijkt geen geldige Bluesky-handle." };
  try {
    const res = await fetch(`https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`, {
      headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { error: `Bluesky kon @${handle} niet vinden.` };
    const body = (await res.json()) as { did?: string };
    const did = typeof body.did === "string" && /^did:(plc|web):[a-zA-Z0-9._:%-]{1,200}$/.test(body.did) ? body.did : null;
    return did ? { handle, did } : { error: `Geen DID gevonden voor @${handle}.` };
  } catch {
    return { error: "Bluesky is niet bereikbaar. Probeer het opnieuw." };
  }
}
