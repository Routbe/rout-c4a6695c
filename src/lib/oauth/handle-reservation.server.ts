/** Server side of `identity:handle_reservation`: rate limit, integrity facts, claim. */
import { sql } from "@/lib/neon";
import { buildReservationClaim, HANDLE_RESERVATION_RATE, type HandleReservationClaim, type ReservationFacts } from "./handle-reservation";

type Row = Record<string, unknown>;

async function factsOf(userId: string): Promise<ReservationFacts | null> {
  // Root profile only (profiles.id = users.id): aliases never count as the member's handle.
  const r = ((await sql`select u.account_status, u.email_confirmed_at, p.username, p.is_banned, p.is_shadowbanned,
      (select count(*)::int from public.profiles q where p.username is not null and lower(q.username) = lower(p.username)) as holders
    from public.users u left join public.profiles p on p.id = u.id
    where u.id = ${userId} limit 1`) as Row[])[0];
  if (!r) return null;
  return {
    handle: r["username"],
    accountActive: r["account_status"] === "active",
    emailConfirmed: Boolean(r["email_confirmed_at"]),
    banned: r["is_banned"] === true,
    shadowbanned: r["is_shadowbanned"] === true,
    holders: Number(r["holders"] ?? 0),
  };
}

/** Never throws: a failed check reads as `unavailable`, so an app never adopts an unvouched name. */
export async function handleReservationClaim(userId: string, clientId: string, sub: string): Promise<HandleReservationClaim> {
  const nowSec = Math.floor(Date.now() / 1000);
  try {
    const { hitRateLimit } = await import("@/lib/rate-limit-db.server");
    const limit = await hitRateLimit("handle-reservation", `${clientId}:${userId}`, HANDLE_RESERVATION_RATE, { failClosed: true });
    let verifiedHuman = false;
    try {
      const { identityTier } = await import("@/lib/auth/oidc-identifiers.server");
      verifiedHuman = (await identityTier(userId)) !== "none";
    } catch {
      verifiedHuman = false;
    }
    return await buildReservationClaim({
      clientId,
      sub,
      facts: limit.ok ? await factsOf(userId) : null,
      verifiedHuman,
      rateLimited: !limit.ok,
      nowSec,
    });
  } catch (e) {
    console.warn("[oauth] handle reservation check failed", (e as Error)?.name ?? "error");
    return { status: "unavailable", verified_human: false, issued_at: nowSec };
  }
}
