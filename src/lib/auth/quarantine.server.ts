/**
 * Passkey-only cutover (db/0207). A Better Auth user WITHOUT a passkey is
 * quarantined: no session of theirs is honoured. Recovery is out-of-band:
 * the member files a request, an admin verifies them through a trusted channel
 * and approves, which mints a single-use binding token (SHA-256 stored, 24 h)
 * used to register the first passkey (`rq.<token>` WebAuthn context).
 */
import { sql } from "@/lib/neon";

const enc = new TextEncoder();
const TOKEN_TTL_HOURS = 24;
const CACHE_MS = 30_000;
const passkeyCache = new Map<string, { has: boolean; at: number }>();

export async function sha256Hex(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** True when the Better Auth user owns at least one passkey (briefly cached). */
export async function authUserHasPasskey(authUserId: string): Promise<boolean> {
  const hit = passkeyCache.get(authUserId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.has;
  const rows = (await sql`select exists (select 1 from neon_auth.passkey where "userId"::text = ${authUserId}) as has`) as Array<{ has: boolean }>;
  const has = rows[0]?.has === true;
  passkeyCache.set(authUserId, { has, at: Date.now() });
  return has;
}

export function forgetPasskeyCache(authUserId: string) {
  passkeyCache.delete(authUserId);
}

/** Files a recovery request. Always resolves the same way (no account enumeration). */
export async function fileRecoveryRequest(email: string, note: string | null): Promise<void> {
  const clean = email.trim().toLowerCase();
  const rows = (await sql`select u.id::text as id from neon_auth."user" u where lower(u.email) = ${clean} limit 1`) as Array<{ id: string }>;
  const authUserId = rows[0]?.id;
  if (!authUserId || (await authUserHasPasskey(authUserId))) return;
  await sql`insert into public.auth_recovery_requests (auth_user_id, email, note)
    values (${authUserId}, ${clean}, ${note})
    on conflict do nothing`;
}

export type RecoveryRequestRow = {
  id: string;
  email: string;
  note: string | null;
  status: string;
  created_at: string;
  token_expires_at: string | null;
};

export async function listRecoveryRequests(): Promise<RecoveryRequestRow[]> {
  // Approved tokens past their deadline fall back to expired.
  await sql`update public.auth_recovery_requests set status = 'expired', token_hash = null
    where status = 'approved' and token_expires_at < now()`;
  return (await sql`select id::text, email, note, status, created_at::text, token_expires_at::text
    from public.auth_recovery_requests order by (status = 'pending') desc, created_at desc limit 100`) as RecoveryRequestRow[];
}

/** Approves after out-of-band verification. Returns the raw token ONCE (only its hash is stored). */
export async function approveRecoveryRequest(id: string, adminUserId: string, decisionNote: string | null): Promise<string | null> {
  const raw = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
  const rows = (await sql`update public.auth_recovery_requests
    set status = 'approved', decided_at = now(), decided_by = ${adminUserId}::uuid, decision_note = ${decisionNote},
        token_hash = ${await sha256Hex(raw)}, token_expires_at = now() + make_interval(hours => ${TOKEN_TTL_HOURS})
    where id = ${id}::uuid and status = 'pending' returning id`) as unknown[];
  return rows.length ? raw : null;
}

export async function denyRecoveryRequest(id: string, adminUserId: string, decisionNote: string | null): Promise<boolean> {
  const rows = (await sql`update public.auth_recovery_requests
    set status = 'denied', decided_at = now(), decided_by = ${adminUserId}::uuid, decision_note = ${decisionNote}, token_hash = null
    where id = ${id}::uuid and status in ('pending', 'approved') returning id`) as unknown[];
  return rows.length > 0;
}

/** Looks up an approved, unexpired binding token (no consumption). */
export async function resolveBindingToken(raw: string): Promise<{ authUserId: string; email: string } | null> {
  if (!/^[0-9a-f]{64}$/.test(raw)) return null;
  const rows = (await sql`select auth_user_id, email from public.auth_recovery_requests
    where token_hash = ${await sha256Hex(raw)} and status = 'approved' and token_expires_at > now() limit 1`) as Array<{ auth_user_id: string; email: string }>;
  const r = rows[0];
  return r ? { authUserId: r.auth_user_id, email: r.email } : null;
}

/** Atomically burns the token when the first passkey is bound. */
export async function consumeBindingToken(raw: string): Promise<string | null> {
  if (!/^[0-9a-f]{64}$/.test(raw)) return null;
  const rows = (await sql`update public.auth_recovery_requests
    set status = 'bound', bound_at = now(), token_hash = null
    where token_hash = ${await sha256Hex(raw)} and status = 'approved' and token_expires_at > now()
    returning auth_user_id`) as Array<{ auth_user_id: string }>;
  const id = rows[0]?.auth_user_id ?? null;
  if (id) forgetPasskeyCache(id);
  return id;
}
