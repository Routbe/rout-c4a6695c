/**
 * Referral-graaf op Neon: wie nodigde wie uit, hoeveel daarvan geverifieerd
 * zijn, en welke beloning dat oplevert. Server-only.
 */
import { sql } from "@/lib/neon";
import { referralReward, type ReferralReward, type ReferralStats } from "./referral-rewards";

type Row = Record<string, unknown>;

/** Telt de referrals opnieuw uit de graaf en schrijft ze op het profiel. */
async function syncCounters(inviterId: string): Promise<ReferralStats> {
  const rows = (await sql`
    select count(*)::int as invited,
           count(*) filter (where verified)::int as verified_invites
      from public.referrals where inviter_id = ${inviterId}
  `) as Row[];
  const invited = Number(rows[0]?.["invited"] ?? 0);
  const verifiedInvites = Number(rows[0]?.["verified_invites"] ?? 0);

  await sql`
    update public.profiles
       set invited_count = ${invited}, verified_invites = ${verifiedInvites}, updated_at = now()
     where id = ${inviterId}
  `;

  if (invited >= 10) {
    const { awardBadges } = await import("./badge-grants.server");
    await awardBadges(inviterId, ["influencer" as never], "referral", { invited });
  }

  return { invited, verifiedInvites };
}

/**
 * Koppelt een nieuw lid aan de handle die hem uitnodigde. Eén inviter per lid,
 * geen zelf-referral; herhaalde aanroepen zijn een no-op.
 */
export async function claimReferralForUser(
  inviteeId: string,
  handle: string,
): Promise<{ ok: boolean; reason?: string }> {
  const inviterRows = (await sql`
    select id from public.profiles where lower(username) = ${handle} limit 1
  `) as Row[];
  const inviterId = inviterRows[0]?.["id"] as string | undefined;
  if (!inviterId) return { ok: false, reason: "unknown_handle" };
  if (inviterId === inviteeId) return { ok: false, reason: "self_referral" };

  // Only a brand-new account (< 24h) with a confirmed email can name an inviter.
  const fresh = (await sql`
    select 1 from public.users u
     where u.id = ${inviteeId}
       and u.created_at > now() - interval '24 hours'
       and (u.email_confirmed_at is not null
            or exists (select 1 from neon_auth."user" n where n.id::text = u.id::text and n."emailVerified" = true))
     limit 1
  `.catch(() => [])) as Row[];
  if (fresh.length === 0) return { ok: false, reason: "not_eligible" };

  const existing = (await sql`
    select 1 from public.referrals where invitee_id = ${inviteeId} limit 1
  `) as Row[];
  if (existing.length > 0) return { ok: false, reason: "already_referred" };

  await sql`
    insert into public.referrals (inviter_id, invitee_id)
    values (${inviterId}, ${inviteeId})
    on conflict (invitee_id) do nothing
  `;
  await sql`update public.profiles set referred_by = ${inviterId} where id = ${inviteeId}`;
  await syncCounters(inviterId);
  return { ok: true };
}

/** Markeert het lid als geverifieerde vriend van zijn inviter. Nooit fataal. */
export async function markInviteVerified(inviteeId: string): Promise<void> {
  try {
    const rows = (await sql`
      update public.referrals set verified = true, verified_at = now()
       where invitee_id = ${inviteeId} and verified = false
       returning inviter_id
    `) as Row[];
    const inviterId = rows[0]?.["inviter_id"] as string | undefined;
    if (inviterId) await syncCounters(inviterId);
  } catch (error) {
    console.error("[referral] verify propagation failed", error);
  }
}

export async function referralStatsFor(
  userId: string,
): Promise<ReferralStats & { reward: ReferralReward }> {
  let stats: ReferralStats = { invited: 0, verifiedInvites: 0 };
  try {
    const rows = (await sql`
      select count(*)::int as invited,
             count(*) filter (where verified)::int as verified_invites
        from public.referrals where inviter_id = ${userId}
    `) as Row[];
    stats = {
      invited: Number(rows[0]?.["invited"] ?? 0),
      verifiedInvites: Number(rows[0]?.["verified_invites"] ?? 0),
    };
  } catch (error) {
    console.error("[referral] stats unavailable", error);
  }
  return { ...stats, reward: referralReward(stats) };
}
