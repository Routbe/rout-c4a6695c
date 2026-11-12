/**
 * Server-only ImprovMX helpers: registers `username@rout.be` aliases that
 * forward to the member's real inbox. The key is optional — without it every
 * call degrades to `not_configured` instead of throwing.
 */
import { sql } from "@/lib/neon";

const IMPROVMX_DOMAIN = "rout.be";
const API_BASE = `https://api.improvmx.com/v3/domains/${IMPROVMX_DOMAIN}/aliases`;

type Row = Record<string, unknown>;

export type AliasFailure =
  | "not_configured"
  | "no_username"
  | "no_forward"
  /** Forwarding address awaiting double opt-in confirmation. */
  | "unconfirmed_forward"
  | "api_error"
  | "not_found"
  /** Free/unverified account: aliases are reserved for paid or verified members. */
  | "not_entitled";

export type AliasResult =
  | { ok: true; alias: string; forward: string }
  | { ok: false; reason: AliasFailure; detail?: string };

/** Maps an alias attempt onto the status column, without relying on narrowing. */
function aliasStatusFor(result: AliasResult): string {
  if (result.ok) return "active";
  const reason = "reason" in result ? result.reason : null;
  return reason === "not_configured" ? "pending" : "failed";
}

export function improvmxKey(): string | null {
  return process.env["IMPROVMX_API_KEY"] ?? null;
}

function authHeaders(key: string) {
  return {
    Authorization: `Basic ${btoa(`api:${key}`)}`,
    "Content-Type": "application/json",
  };
}

/** Creates (or updates) the alias on ImprovMX. */
export async function createAlias(username: string, forward: string): Promise<AliasResult> {
  const key = improvmxKey();
  if (!key) return { ok: false, reason: "not_configured" };

  const alias = username.trim().toLowerCase().replace(/^@/, "");
  if (!alias) return { ok: false, reason: "no_username" };
  if (!forward.includes("@")) return { ok: false, reason: "no_forward" };

  let res = await fetch(API_BASE, {
    method: "POST",
    headers: authHeaders(key),
    body: JSON.stringify({ alias, forward }),
  });

  // 409 = the alias already exists: fall back to an update so the call is idempotent.
  if (res.status === 409) {
    res = await fetch(`${API_BASE}/${encodeURIComponent(alias)}`, {
      method: "PUT",
      headers: authHeaders(key),
      body: JSON.stringify({ forward }),
    });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, reason: "api_error", detail: detail.slice(0, 300) };
  }
  return { ok: true, alias: `${alias}@${IMPROVMX_DOMAIN}`, forward };
}

/** Deletes an alias entirely — used when a user is permanently banned. */
export async function deleteAlias(username: string): Promise<AliasResult> {
  const key = improvmxKey();
  if (!key) return { ok: false, reason: "not_configured" };

  const alias = username.trim().toLowerCase().replace(/^@/, "");
  if (!alias) return { ok: false, reason: "no_username" };

  const res = await fetch(`${API_BASE}/${encodeURIComponent(alias)}`, {
    method: "DELETE",
    headers: authHeaders(key),
  });
  if (res.status === 404) return { ok: false, reason: "not_found" };
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, reason: "api_error", detail: detail.slice(0, 300) };
  }
  return { ok: true, alias: `${alias}@${IMPROVMX_DOMAIN}`, forward: "" };
}

/**
 * Emergency pause: repoints the alias at a black-hole address so incoming mail
 * stops reaching the member without losing the reservation.
 */
export const ALIAS_BLACKHOLE = `paused@${IMPROVMX_DOMAIN}`;

export async function pauseAlias(username: string): Promise<AliasResult> {
  const key = improvmxKey();
  if (!key) return { ok: false, reason: "not_configured" };
  const alias = username.trim().toLowerCase().replace(/^@/, "");
  if (!alias) return { ok: false, reason: "no_username" };

  const res = await fetch(`${API_BASE}/${encodeURIComponent(alias)}`, {
    method: "PUT",
    headers: authHeaders(key),
    body: JSON.stringify({ forward: ALIAS_BLACKHOLE }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, reason: "api_error", detail: detail.slice(0, 300) };
  }
  return { ok: true, alias: `${alias}@${IMPROVMX_DOMAIN}`, forward: ALIAS_BLACKHOLE };
}

/**
 * Looks the profile up and provisions its alias. Used by the payment webhook.
 *
 * Hard gate: only an active member who is paid or verified may hold a
 * @rout.be alias. Free/unverified accounts never get one provisioned.
 */
export async function provisionAliasForUser(userId: string): Promise<AliasResult> {
  const rows = (await sql`
    select username, forwarding_email, forwarding_email_verified, is_paid, verified, status,
           is_banned, is_suspended
      from public.profiles
     where id = ${userId}
     limit 1
  `) as Row[];
  const profile = rows[0];

  if (!profile?.["username"]) return { ok: false, reason: "no_username" };

  const entitled =
    (profile["is_paid"] === true || profile["verified"] === true) &&
    profile["status"] === "active" &&
    profile["is_banned"] !== true &&
    profile["is_suspended"] !== true;

  if (!entitled) {
    await sql`update public.profiles set alias_status = 'none' where id = ${userId}`;
    return { ok: false, reason: "not_entitled" };
  }

  let forward = (profile["forwarding_email"] as string | null) ?? null;
  if (forward && profile["forwarding_email_verified"] !== true) {
    // Double opt-in: never forward to an address the owner has not confirmed.
    await sql`update public.profiles set alias_status = 'pending' where id = ${userId}`;
    return { ok: false, reason: "unconfirmed_forward" };
  }
  if (!forward) {
    const userRows =
      (await sql`select email from public.users where id = ${userId} limit 1`) as Row[];
    forward = (userRows[0]?.["email"] as string | null) ?? null;
  }
  if (!forward) return { ok: false, reason: "no_forward" };

  const result = await createAlias(profile["username"] as string, forward);

  await sql`
    update public.profiles
       set forwarding_email = ${forward}, alias_status = ${aliasStatusFor(result)}
     where id = ${userId}
  `;

  return result;
}

/** Moves an alias to a new handle: create the new one, drop the old one. */
export async function renameAliasForUser(
  userId: string,
  previousUsername: string | null,
): Promise<AliasResult> {
  const result = await provisionAliasForUser(userId);
  if (result.ok && previousUsername && previousUsername !== result.alias.split("@")[0]) {
    await deleteAlias(previousUsername).catch(() => undefined);
  }
  return result;
}

/** Freezes (bans) the alias: delete on ImprovMX + mark the profile. */
export async function freezeAliasForUser(userId: string): Promise<AliasResult> {
  const rows = (await sql`
    select username from public.profiles where id = ${userId} limit 1
  `) as Row[];
  const profile = rows[0];
  if (!profile?.["username"]) return { ok: false, reason: "no_username" };

  const result = await deleteAlias(profile["username"] as string);
  await sql`update public.profiles set alias_status = 'frozen' where id = ${userId}`;
  return result;
}

export type AliasHealth = {
  configured: boolean;
  domain: string;
  remoteCount: number | null;
  error?: string;
};

/** Reports whether ImprovMX is reachable and how many aliases it holds. */
export async function aliasHealth(): Promise<AliasHealth> {
  const key = improvmxKey();
  if (!key) return { configured: false, domain: IMPROVMX_DOMAIN, remoteCount: null };
  try {
    const res = await fetch(`${API_BASE}?limit=1`, { headers: authHeaders(key) });
    if (!res.ok) {
      return {
        configured: true,
        domain: IMPROVMX_DOMAIN,
        remoteCount: null,
        error: `ImprovMX responded ${res.status}`,
      };
    }
    const body = (await res.json()) as { total?: number; aliases?: unknown[] };
    return {
      configured: true,
      domain: IMPROVMX_DOMAIN,
      remoteCount: body.total ?? body.aliases?.length ?? null,
    };
  } catch (error) {
    return {
      configured: true,
      domain: IMPROVMX_DOMAIN,
      remoteCount: null,
      error: error instanceof Error ? error.message : "Unreachable",
    };
  }
}
