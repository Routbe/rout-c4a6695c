import { sql } from "@/lib/neon";
import { createRevokeToken, verifyRevokeToken } from "./link-token";

/**
 * Identity graph (db/0113): ownership proofs per (issuer, provider_sub).
 * Every state change appends a hash-chained identity_link_events row.
 * login_enabled stays false until the owner explicitly opts in.
 */
type Row = Record<string, unknown>;
const enc = new TextEncoder();

export type IdentityLink = {
  id: string;
  provider: string;
  issuer: string;
  displayHandle: string | null;
  proofMethod: string;
  status: "verified" | "revoked" | "disputed";
  loginEnabled: boolean;
  createdAt: string;
  lastVerifiedAt: string;
};

export type Proof = {
  issuer: string;
  providerSub: string;
  displayHandle?: string | null;
  proofMethod: "oidc_id_token" | "oauth_userinfo" | "atproto_oauth" | "dns_txt" | "rel_me";
  proofDigest: Uint8Array;
};

type Actor = "self" | "system" | `admin:${string}`;
type EventName = "linked" | "reverified" | "login_enabled" | "login_disabled" | "revoked" | "disputed";

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const sha = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));

export async function authIdOf(userId: string): Promise<string> {
  const rows = (await sql`select user_metadata->>'neon_auth_id' as auth_id from public.users where id = ${userId} limit 1`) as Row[];
  return (rows[0]?.["auth_id"] as string | null) ?? userId;
}

async function linkSecret(): Promise<string> {
  const s = process.env["APP_SESSION_SECRET"];
  if (s) return s;
  const { resolveAuthSecret } = await import("@/lib/better-auth.server");
  const r = resolveAuthSecret();
  if (!r) throw new Error("link_secret_missing");
  return r.secret;
}

function toLink(r: Row): IdentityLink {
  return {
    id: String(r["id"]),
    provider: String(r["provider"]),
    issuer: String(r["issuer"]),
    displayHandle: (r["display_handle"] as string | null) ?? null,
    proofMethod: String(r["proof_method"]),
    status: r["status"] as IdentityLink["status"],
    loginEnabled: Boolean(r["login_enabled"]),
    createdAt: new Date(String(r["created_at"])).toISOString(),
    lastVerifiedAt: new Date(String(r["last_verified_at"])).toISOString(),
  };
}

function eventSql(linkId: string, authId: string, event: EventName, actor: Actor, ipHash: string | null, uaHash: string | null) {
  return sql`insert into public.identity_link_events (link_id, user_id, event, actor, ip_hash, ua_hash, event_hash)
    values (${linkId}, ${authId}, ${event}, ${actor},
      case when ${ipHash}::text is null then null else decode(${ipHash}, 'hex') end,
      case when ${uaHash}::text is null then null else decode(${uaHash}, 'hex') end,
      decode(repeat('00', 32), 'hex'))`;
}

async function clientHashes(request?: Request | null) {
  if (!request) return { ip: null, ua: null };
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ua = request.headers.get("user-agent");
  return { ip: ip ? hex(await sha(`ip:${ip}`)) : null, ua: ua ? hex(await sha(`ua:${ua}`)) : null };
}

export async function listLinks(userId: string): Promise<IdentityLink[]> {
  const authId = await authIdOf(userId);
  const rows = (await sql`select * from public.identity_links where user_id = ${authId}
    order by created_at desc limit 100`) as Row[];
  return rows.map(toLink);
}

/**
 * Creates (or re-verifies) a link. Callers must already have consumed a fresh
 * step-up and validated the proof. A subject owned by someone else is refused.
 */
export async function addLink(input: {
  userId: string;
  provider: string;
  proof: Proof;
  stepUpMethod: "passkey" | "totp" | "email_code" | "signup";
  stepUpAt: Date;
  request?: Request | null;
}): Promise<{ link: IdentityLink; created: boolean }> {
  const authId = await authIdOf(input.userId);
  const existing = (await sql`select * from public.identity_links
    where issuer = ${input.proof.issuer} and provider_sub = ${input.proof.providerSub} limit 1`) as Row[];
  const { ip, ua } = await clientHashes(input.request);
  const digest = hex(input.proof.proofDigest);
  if (existing[0]) {
    if (String(existing[0]["user_id"]) !== authId) throw new Error("identity_owned_elsewhere");
    const id = String(existing[0]["id"]);
    await sql.transaction([
      sql`update public.identity_links set status = 'verified', revoked_at = null, last_verified_at = now(),
          proof_method = ${input.proof.proofMethod}, proof_digest = decode(${digest}, 'hex'),
          display_handle = ${input.proof.displayHandle ?? null},
          step_up_method = ${input.stepUpMethod}, step_up_at = ${input.stepUpAt.toISOString()}
        where id = ${id}`,
      eventSql(id, authId, "reverified", "self", ip, ua),
    ]);
    const rows = (await sql`select * from public.identity_links where id = ${id}`) as Row[];
    return { link: toLink(rows[0]!), created: false };
  }
  const id = crypto.randomUUID();
  await sql.transaction([
    sql`insert into public.identity_links (id, user_id, provider, issuer, provider_sub, display_handle,
        proof_method, proof_digest, step_up_method, step_up_at)
      values (${id}, ${authId}, ${input.provider}, ${input.proof.issuer}, ${input.proof.providerSub},
        ${input.proof.displayHandle ?? null}, ${input.proof.proofMethod}, decode(${digest}, 'hex'),
        ${input.stepUpMethod}, ${input.stepUpAt.toISOString()})`,
    eventSql(id, authId, "linked", "self", ip, ua),
  ]);
  const rows = (await sql`select * from public.identity_links where id = ${id}`) as Row[];
  const link = toLink(rows[0]!);
  void notifyLinked(input.userId, link).catch(() => undefined);
  return { link, created: true };
}

async function notifyLinked(userId: string, link: IdentityLink) {
  const { recipient, siteOrigin } = await import("@/lib/site-mail.server");
  const r = await recipient(userId);
  if (!r.email) return;
  const token = await createRevokeToken(await linkSecret(), link.id);
  const url = `${siteOrigin()}/identity/revoke?token=${encodeURIComponent(token)}`;
  const label = (link.displayHandle ?? link.issuer).replace(/[<>&"]/g, "");
  const { sendTransactionalEmail } = await import("@/lib/notifications.server");
  await sendTransactionalEmail({
    to: r.email,
    subject: "Er is een identiteit gekoppeld aan je ROUT-account",
    html: `<p>We hebben <strong>${label}</strong> gekoppeld aan je ROUT-account.</p>
      <p>Was jij dit niet? <a href="${url}">Trek deze koppeling met één klik in</a> en wijzig daarna je beveiliging.</p>`,
    tags: ["identity-linked"],
  });
}

export async function setLoginEnabled(userId: string, linkId: string, enabled: boolean, request?: Request | null) {
  const authId = await authIdOf(userId);
  const { ip, ua } = await clientHashes(request);
  const res = (await sql.transaction([
    sql`update public.identity_links set login_enabled = ${enabled}
      where id = ${linkId} and user_id = ${authId} and status = 'verified' and login_enabled <> ${enabled} returning id`,
  ])) as Row[][];
  if (!res[0]?.length) return false;
  await eventSql(linkId, authId, enabled ? "login_enabled" : "login_disabled", "self", ip, ua);
  return true;
}

async function revokeAs(linkId: string, authId: string, actor: Actor, request?: Request | null) {
  const { ip, ua } = await clientHashes(request);
  const res = (await sql`update public.identity_links set status = 'revoked', login_enabled = false, revoked_at = now()
    where id = ${linkId} and user_id = ${authId} and status <> 'revoked' returning id`) as Row[];
  if (!res.length) return false;
  await eventSql(linkId, authId, "revoked", actor, ip, ua);
  return true;
}

export async function revokeLink(userId: string, linkId: string, request?: Request | null) {
  return revokeAs(linkId, await authIdOf(userId), "self", request);
}

/** Looks up the link behind an emailed token without changing anything (GET is read-only). */
export async function describeRevokeToken(token: string) {
  const linkId = await verifyRevokeToken(await linkSecret(), token);
  if (!linkId) return null;
  const rows = (await sql`select * from public.identity_links where id = ${linkId}`) as Row[];
  return rows[0] ? toLink(rows[0]) : null;
}

export async function revokeByToken(token: string, request?: Request | null) {
  const linkId = await verifyRevokeToken(await linkSecret(), token);
  if (!linkId) return false;
  const rows = (await sql`select user_id from public.identity_links where id = ${linkId}`) as Row[];
  if (!rows[0]) return false;
  return revokeAs(linkId, String(rows[0]["user_id"]), "self", request);
}
