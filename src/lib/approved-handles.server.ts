/**
 * Whitelist-flow voor influencer- en bedrijfsverificatie.
 * Beheerder keurt specifieke namen goed → gebruiker claimt er één.
 * Server-only.
 */
import { sql } from "@/lib/neon";
import { canClaim, pickApproved, type WhitelistEntry } from "./approved-handles";

type Row = Record<string, unknown>;

/** Stores an admin-chosen allowed list (direct grant, no request). Voids older open entries. */
export async function storeAllowedHandles(userId: string, kind: string, handles: string[]) {
  const requestId = crypto.randomUUID();
  await sql`update public.approved_handles set status = 'void' where user_id = ${userId} and status = 'approved'`;
  for (const handle of handles) {
    await sql`insert into public.approved_handles (user_id, request_id, request_kind, handle)
      values (${userId}, ${requestId}, ${kind}, ${handle})
      on conflict (user_id, lower(handle)) do update set status = 'approved', request_id = excluded.request_id`;
  }
}

/** Intake-mails: bevestiging naar de aanvrager + beoordelingsmail met knoppen naar de beheerder. */
export async function notifyIntake(userId: string, kind: "influencer" | "business", _name: string, requestId: string) {
  const { sendRequestReceived } = await import("./verification-mail.server");
  await sendRequestReceived(userId, kind, requestId);
}

/** Keurt een selectie van de voorgestelde namen goed (whitelist). Lege selectie = afwijzen. */
export async function approveWithWhitelist(
  kind: "influencer" | "business",
  requestId: string,
  adminId: string,
  approved: string[],
) {
  const rows = (kind === "influencer"
    ? await sql`select * from public.influencer_requests where id = ${requestId} limit 1`
    : await sql`select * from public.business_verifications where id = ${requestId} limit 1`) as Row[];
  const req = rows[0];
  if (!req) return { ok: false as const, reason: "Aanvraag niet gevonden." };
  const userId = req["user_id"] as string;
  const { normalizeHandleForStorage } = await import("./handle-rules");
  const proposed =
    kind === "influencer"
      ? ((req["handle_choices"] as string[] | null) ?? [])
      : [String(req["website_domain"] ?? ""), String(req["company_name"] ?? "")];
  // Bij bedrijven mag de beheerder ook een eigen merknaam toevoegen.
  const list = kind === "business"
    ? approved.map((h) => normalizeHandleForStorage(h)).filter(Boolean)
    : pickApproved(proposed.map((h) => normalizeHandleForStorage(h)), approved.map((h) => normalizeHandleForStorage(h)));

  if (list.length === 0) return { ok: false as const, reason: "Kies minstens één naam." };

  for (const handle of list) {
    await sql`insert into public.approved_handles (user_id, request_id, request_kind, handle)
      values (${userId}, ${requestId}, ${kind}, ${handle})
      on conflict (user_id, lower(handle)) do update set status = 'approved', request_id = excluded.request_id`;
  }
  if (kind === "influencer") {
    await sql`update public.profiles set is_influencer = true, verified = true,
      verified_at = coalesce(verified_at, now()) where id = ${userId}`;
    await sql`update public.influencer_requests set status = 'approved', reviewed_at = now(),
      reviewed_by = ${adminId} where id = ${requestId}`;
  } else {
    await sql`update public.profiles set is_business = true, business_name = ${req["company_name"] as string},
      business_vat = ${req["vat_number"] as string}, verified = true,
      verified_at = coalesce(verified_at, now()) where id = ${userId}`;
    await sql`update public.business_verifications set status = 'approved', reviewed_at = now(),
      reviewed_by = ${adminId} where id = ${requestId}`;
  }
  const { sendDecision } = await import("./verification-mail.server");
  await sendDecision(userId, kind, { approved: true, handle: null });
  return { ok: true as const, approved: list };
}

export async function notifyRejected(userId: string, kind: "influencer" | "business" = "influencer", reason: string | null = null) {
  const { sendDecision } = await import("./verification-mail.server");
  await sendDecision(userId, kind, { approved: false, reason });
}

export async function myApprovedHandles(userId: string): Promise<WhitelistEntry[]> {
  const rows = (await sql`select handle, status from public.approved_handles
    where user_id = ${userId} and status <> 'void' order by created_at`) as Row[];
  return rows.map((r) => ({ handle: String(r["handle"]), status: r["status"] as WhitelistEntry["status"] }));
}

export async function claimHandle(userId: string, handle: string) {
  const entries = await myApprovedHandles(userId);
  if (!canClaim(entries, handle)) return { ok: false as const, reason: "Deze naam staat niet op je goedgekeurde lijst." };
  const key = handle.toLowerCase();
  const { isHandleAvailableFor } = await import("./handle-namespace.server");
  if (!(await isHandleAvailableFor(key, userId))) return { ok: false as const, reason: "Deze naam is intussen bezet." };
  const current = (await sql`select username from public.profiles where id = ${userId} limit 1`) as Row[];
  const { preserveFreeAliasHandle } = await import("./alias-profile.server");
  await preserveFreeAliasHandle(userId, (current[0]?.["username"] as string | null) ?? null);
  await sql`update public.profiles set username = ${key} where id = ${userId}`;
  await sql`update public.approved_handles set status = 'claimed', claimed_at = now()
    where user_id = ${userId} and lower(handle) = ${key}`;
  await sql`update public.approved_handles set status = 'void'
    where user_id = ${userId} and status = 'approved'`;
  await sql`update public.influencer_requests set granted_handle = ${key}
    where user_id = ${userId} and status = 'approved'`;
  return { ok: true as const, handle: key };
}

/** Zoekt een account op e-mail of handle (voor "Nieuwe Persoon Verifiëren"). */
export async function findAccount(query: string) {
  const q = query.trim().replace(/^@/, "").toLowerCase();
  const rows = (await sql`select u.id, u.email, p.username, p.display_name, coalesce(p.verified, false) as verified
    from public.users u left join public.profiles p on p.id = u.id
    where lower(u.email) = ${q} or lower(p.username) = ${q} limit 1`) as Row[];
  const r = rows[0];
  return r
    ? { id: String(r["id"]), email: (r["email"] as string) ?? null, username: (r["username"] as string) ?? null,
        displayName: (r["display_name"] as string) ?? null, verified: Boolean(r["verified"]) }
    : null;
}
