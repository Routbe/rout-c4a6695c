/** Custom live status storage: hashed API keys, ephemeral status and privacy rules. */
import { sql } from "@/lib/neon";
import { DEFAULT_RULES, PRESENCE_TTL_SECONDS, expiresAtFor, visibleStatus, type PresencePayload, type PresenceRules, type StoredStatus } from "./custom-presence";

type Row = Record<string, unknown>;

async function sha256(v: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

function parseRules(v: unknown): PresenceRules {
  const r = (v && typeof v === "object" ? v : {}) as Partial<PresenceRules>;
  return {
    stealthDays: Array.isArray(r.stealthDays) ? r.stealthDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [],
    workStart: typeof r.workStart === "number" ? r.workStart : null,
    workEnd: typeof r.workEnd === "number" ? r.workEnd : null,
    timeZone: typeof r.timeZone === "string" && r.timeZone ? r.timeZone : DEFAULT_RULES.timeZone,
    hideExplicit: r.hideExplicit === true,
  };
}

/** Issues a new key (shown once); only its hash is stored. */
export async function rotatePresenceKey(userId: string): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const key = "rp_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const hash = await sha256(key);
  await sql`insert into public.user_custom_presence (user_id, api_key_hash, api_key_created_at)
    values (${userId}, ${hash}, now())
    on conflict (user_id) do update set api_key_hash = excluded.api_key_hash, api_key_created_at = now()`;
  return key;
}

export async function revokePresenceKey(userId: string): Promise<void> {
  await sql`update public.user_custom_presence set api_key_hash = null, api_key_created_at = null where user_id = ${userId}`;
}

export async function userForPresenceKey(key: string): Promise<string | null> {
  if (!/^rp_[0-9a-f]{48}$/.test(key)) return null;
  const rows = (await sql`select user_id from public.user_custom_presence where api_key_hash = ${await sha256(key)} limit 1`) as Row[];
  return (rows[0]?.["user_id"] as string | undefined) ?? null;
}

export async function setCustomStatus(userId: string, p: PresencePayload): Promise<{ expiresAt: string | null }> {
  const expiresAt = expiresAtFor(p.expires_in_minutes, new Date());
  await sql`insert into public.user_custom_presence (user_id, status_text, icon, category, metadata, expires_at, updated_at)
    values (${userId}, ${p.status_text}, ${p.icon ?? null}, ${p.category ?? "custom"}, ${JSON.stringify(p.metadata ?? {})}::jsonb, ${expiresAt}, now())
    on conflict (user_id) do update set status_text = excluded.status_text, icon = excluded.icon, category = excluded.category,
      metadata = excluded.metadata, expires_at = excluded.expires_at, updated_at = now()`;
  cache.delete(userId);
  return { expiresAt };
}

export async function clearCustomStatus(userId: string): Promise<void> {
  await sql`update public.user_custom_presence set status_text = null, expires_at = null, updated_at = now() where user_id = ${userId}`;
  cache.delete(userId);
}

export async function myCustomPresence(userId: string) {
  const r = ((await sql`select status_text, icon, category, expires_at, api_key_created_at, rules
    from public.user_custom_presence where user_id = ${userId} limit 1`) as Row[])[0];
  return {
    statusText: (r?.["status_text"] as string | null) ?? null,
    icon: (r?.["icon"] as string | null) ?? null,
    category: (r?.["category"] as string | null) ?? "custom",
    expiresAt: r?.["expires_at"] ? new Date(String(r["expires_at"])).toISOString() : null,
    hasKey: Boolean(r?.["api_key_created_at"]),
    rules: parseRules(r?.["rules"]),
  };
}

export async function saveRules(userId: string, rules: PresenceRules): Promise<void> {
  const clean = parseRules(rules);
  await sql`insert into public.user_custom_presence (user_id, rules) values (${userId}, ${JSON.stringify(clean)}::jsonb)
    on conflict (user_id) do update set rules = excluded.rules`;
  cache.delete(userId);
}

/** Owner of a public, visible profile handle (root or alias). Visibility enforced here. */
export async function publicPresenceOwner(handle: string): Promise<string | null> {
  const rows = (await sql`select coalesce(p.id, a.user_id) as user_id
    from (select 1) x
    left join public.profiles p on lower(p.username) = lower(${handle})
      and coalesce((p.display_prefs ->> 'publicProfile')::boolean, true)
    left join public.alias_profiles a on lower(a.handle) = lower(${handle})
      and coalesce((a.display_prefs ->> 'publicProfile')::boolean, true)
    limit 1`) as Row[];
  return (rows[0]?.["user_id"] as string | undefined) ?? null;
}

const cache = new Map<string, { at: number; value: { status: StoredStatus | null; rules: PresenceRules } }>();

/** Visitor-safe status, cached in memory for PRESENCE_TTL_SECONDS. Rules are applied on every read. */
export async function publicCustomStatus(userId: string): Promise<StoredStatus | null> {
  const hit = cache.get(userId);
  let value = hit && Date.now() - hit.at < PRESENCE_TTL_SECONDS * 1000 ? hit.value : null;
  if (!value) {
    const r = ((await sql`select status_text, icon, category, expires_at, rules from public.user_custom_presence where user_id = ${userId} limit 1`) as Row[])[0];
    const status: StoredStatus | null = r?.["status_text"] ? {
      statusText: String(r["status_text"]),
      icon: (r["icon"] as string | null) ?? null,
      category: (r["category"] as StoredStatus["category"]) ?? "custom",
      expiresAt: r["expires_at"] ? new Date(String(r["expires_at"])).toISOString() : null,
    } : null;
    value = { status, rules: parseRules(r?.["rules"]) };
    cache.set(userId, { at: Date.now(), value });
  }
  return visibleStatus(value.status, value.rules, new Date());
}
