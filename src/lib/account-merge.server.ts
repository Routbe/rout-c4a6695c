import { sql } from "@/lib/neon";
import { generateToken, hashToken } from "@/lib/auth/token-hash.server";

/**
 * Sovereign account merge.
 *
 * A — the primary (kept) account mints a 5-minute pin + QR token.
 * B — the second account enters the pin and gets a preview of both accounts;
 *     a 6-digit code is e-mailed to that account's address.
 * C — with the code it chooses which handle and which card design to keep.
 *     Everything (links, sign-ins, passkeys, badges, data) moves to the primary
 *     account without duplicates; the other design becomes a saved template.
 */

const TICKET_TTL_MINUTES = 5;
type Row = Record<string, unknown>;
export type MergeSide = "primary" | "secondary";

export type MergeAccountSummary = {
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  verified: boolean;
  email: string | null;
  providers: string[];
};

function randomPin(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
  return String(n % 1_000_000).padStart(6, "0");
}

export async function createMergeTicket(primaryUserId: string) {
  const pin = randomPin();
  const token = generateToken(24);
  const [pinHash, tokenHash] = await Promise.all([hashToken(pin), hashToken(token)]);
  await sql`update public.account_merge_tickets set used_at = now()
     where primary_user_id = ${primaryUserId} and used_at is null`;
  const rows = (await sql`
    insert into public.account_merge_tickets (primary_user_id, pin_hash, token_hash, expires_at)
    values (${primaryUserId}, ${pinHash}, ${tokenHash}, now() + make_interval(mins => ${TICKET_TTL_MINUTES}))
    returning id, expires_at`) as Row[];
  const expiresAt = String(rows[0]?.["expires_at"]);
  try {
    const { notifyUser } = await import("./notifications.server");
    await notifyUser(primaryUserId, "merge_verification", { ticket_id: rows[0]?.["id"], expires_at: expiresAt },
      { EXPIRES_AT: expiresAt, TTL_MINUTES: TICKET_TTL_MINUTES });
  } catch (error) {
    console.error("[merge] notify failed", error);
  }
  return { pin, token, ticketId: rows[0]?.["id"] as string, expiresAt };
}

/** Failed redeem attempts in the window; null when unknown (callers fail closed). */
async function countMergeFailures(userId: string): Promise<number | null> {
  try {
    const { sha256Hex } = await import("./rate-limit-db.server");
    const bucket = `merge-redeem-fail:${await sha256Hex(userId)}`;
    const rows = (await sql`select coalesce(sum(hits), 0)::int as hits from public.rate_limits
       where bucket = ${bucket} and window_start > now() - make_interval(mins => ${TICKET_TTL_MINUTES * 2})`) as Row[];
    return Number(rows[0]?.["hits"] ?? 0);
  } catch (error) {
    console.error("[merge] failure counter unavailable", (error as Error)?.message);
    return null;
  }
}

async function findTicket(pin: string | null, token: string | null) {
  const hash = await hashToken((pin ?? token ?? "").trim());
  const rows = (await sql`select id, primary_user_id, preview_user_id, expires_at from public.account_merge_tickets
     where used_at is null and expires_at > now() and (pin_hash = ${hash} or token_hash = ${hash})
     order by created_at desc limit 1`) as Row[];
  return rows[0] ?? null;
}

async function resolveTicket(secondaryUserId: string, pin: string | null, token: string | null) {
  const { hitRateLimit } = await import("./rate-limit-db.server");
  const { mergeAttemptAllowed } = await import("./account-merge-rules");
  if (!mergeAttemptAllowed(await countMergeFailures(secondaryUserId))) return { error: "rate_limited" as const };
  const ticket = await findTicket(pin, token);
  if (!ticket) {
    await hitRateLimit("merge-redeem-fail", secondaryUserId, { limit: 5, windowSec: TICKET_TTL_MINUTES * 60 });
    return { error: "invalid_or_expired" as const };
  }
  if (ticket["primary_user_id"] === secondaryUserId) return { error: "same_account" as const };
  return { ticket };
}

async function summary(userId: string): Promise<MergeAccountSummary> {
  const rows = (await sql`select p.username, p.display_name, p.avatar_url, p.verified, u.email
    from public.users u left join public.profiles p on p.id = u.id where u.id = ${userId} limit 1`) as Row[];
  const r = rows[0] ?? {};
  let providers: string[] = [];
  try {
    const { linkedAccountsOf } = await import("@/lib/oauth/provider.server");
    providers = [...new Set((await linkedAccountsOf(userId)).map((a) => a.provider))];
  } catch {
    /* summary stays usable without providers */
  }
  const { maskEmail } = await import("./security-code.server");
  return {
    handle: (r["username"] as string | null) ?? null,
    displayName: (r["display_name"] as string | null) ?? null,
    avatarUrl: (r["avatar_url"] as string | null) ?? null,
    verified: Boolean(r["verified"]),
    email: r["email"] ? maskEmail(String(r["email"])) : null,
    providers,
  };
}

/** Step B: validate the pin, show both accounts and e-mail a confirmation code. */
export async function previewMerge(input: { secondaryUserId: string; pin?: string | null; token?: string | null; request?: Request | null }) {
  const found = await resolveTicket(input.secondaryUserId, input.pin ?? null, input.token ?? null);
  if ("error" in found) return { ok: false as const, reason: found.error };
  const ticket = found.ticket;
  if (!ticket) return { ok: false as const, reason: "invalid_or_expired" as const };
  // Bind the ticket to the first account that previews it; nobody else can redeem it.
  const bound = (await sql`update public.account_merge_tickets set preview_user_id = ${input.secondaryUserId}
    where id = ${ticket["id"] as string} and used_at is null
      and (preview_user_id is null or preview_user_id = ${input.secondaryUserId}) returning id`) as Row[];
  if (!bound.length) return { ok: false as const, reason: "invalid_or_expired" as const };
  const { issueSecurityCode } = await import("./security-code.server");
  const sent = await issueSecurityCode(input.secondaryUserId, "merge", input.request);
  if (!sent.ok) return { ok: false as const, reason: sent.reason };
  const [primary, secondary] = await Promise.all([summary(ticket["primary_user_id"] as string), summary(input.secondaryUserId)]);
  return { ok: true as const, primary, secondary, codeSentTo: sent.sentTo };
}

/** Step C: one SQL function locks, verifies, transfers and consumes the proof. */
export async function redeemMergeTicket(input: {
  secondaryUserId: string;
  pin?: string | null;
  token?: string | null;
  code: string;
  keepHandle: MergeSide;
  keepDesign: MergeSide;
}) {
  const rules = await import("./account-merge-rules");
  const keepHandle = rules.parseMergeSide(input.keepHandle);
  const keepDesign = rules.parseMergeSide(input.keepDesign);
  if (!rules.mergeAttemptAllowed(await countMergeFailures(input.secondaryUserId))) {
    return { ok: false as const, reason: "rate_limited" as const };
  }
  const code = (input.code ?? "").replace(/\D/g, "");
  if (code.length !== 6) return { ok: false as const, reason: "bad_code" as const };
  const [ticketDigest, codeDigest] = await Promise.all([
    hashToken((input.pin ?? input.token ?? "").trim()),
    hashToken(`${input.secondaryUserId}:merge:${code}`),
  ]);
  const { runQuery } = await import("@/lib/neon");
  try {
    // Caller identity comes from authenticated request context, not these inputs.
    const result = await runQuery(
      "select public.execute_account_merge($1, $2, $3, $4) as result",
      [ticketDigest, codeDigest, keepHandle, keepDesign],
    );
    const outcome = result.rows[0]?.["result"] as { ok: boolean; reason?: "bad_code"; primaryUserId?: string } | undefined;
    if (!outcome) throw new Error("merge_result_missing");
    if (!outcome.ok) {
      const { hitRateLimit } = await import("./rate-limit-db.server");
      await hitRateLimit("merge-redeem-fail", input.secondaryUserId, { limit: 5, windowSec: TICKET_TTL_MINUTES * 60 });
      return { ok: false as const, reason: outcome.reason ?? "bad_code" };
    }
    if (!outcome.primaryUserId) throw new Error("merge_result_missing");
    return { ok: true as const, primaryUserId: outcome.primaryUserId };
  } catch (error) {
    console.error("[merge] rolled back", (error as Error)?.message);
    return { ok: false as const, reason: rules.mergeFailureReason(error) };
  }
}

