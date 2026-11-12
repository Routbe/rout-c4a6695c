import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";

const INVITE_COOKIE = "rout_invite_proof";

async function inviteSig(handle: string): Promise<string> {
  const { signValueRaw } = await import("./go-link.server");
  return signValueRaw(`invite:${handle}`);
}

/**
 * Called by the /r/<handle> landing page: stores server-signed, HttpOnly proof that this
 * browser opened that member's invite link. claimReferral accepts only a matching proof.
 */
export const tagReferralVisit = createServerFn({ method: "POST" })
  .inputValidator(handleSchemaPlain)
  .handler(async ({ data }) => {
    const { getCookie, setCookie } = await import("@tanstack/react-start/server");
    if (getCookie(INVITE_COOKIE)) return { ok: true as const }; // first touch wins
    setCookie(INVITE_COOKIE, `${data.referrer}.${await inviteSig(data.referrer)}`, {
      httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
    });
    return { ok: true as const };
  });

function handleSchemaPlain(data: unknown) {
  return handleSchema(data);
}

function handleSchema(data: unknown) {
  const handle = String((data as { referrer?: unknown })?.referrer ?? "")
    .replace(/^@/, "")
    .toLowerCase()
    .trim();
  if (!/^[a-z0-9](?:[a-z0-9._-]{0,118}[a-z0-9])?$/.test(handle)) {
    throw new Error("Invalid referrer handle");
  }
  return { referrer: handle };
}

/**
 * Bindt het ingelogde lid aan de handle die hem uitnodigde. Eén inviter per
 * lid, geen zelf-referral — een dubbele claim is een stille no-op.
 */
export const claimReferral = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(handleSchema)
  .handler(async ({ data, context }) => {
    // The inviter must come from the signed invite-link proof, never from the request alone.
    const { getCookie, deleteCookie } = await import("@tanstack/react-start/server");
    const proof = getCookie(INVITE_COOKIE) ?? "";
    const dot = proof.lastIndexOf(".");
    const proofHandle = dot > 0 ? proof.slice(0, dot) : "";
    const validProof = proofHandle === data.referrer && proof.slice(dot + 1) === (await inviteSig(proofHandle));
    if (!validProof) return { ok: false as const, reason: "no_invite_proof" };
    deleteCookie(INVITE_COOKIE, { path: "/" });
    const { claimReferralForUser } = await import("./referral.server");
    const result = await claimReferralForUser(context.userId, data.referrer);
    return result.ok
      ? { ok: true as const }
      : { ok: false as const, reason: result.reason ?? "failed" };
  });

/** Aantal uitnodigingen, geverifieerde vrienden en de vrijgespeelde beloning. */
export const getReferralStats = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { referralStatsFor } = await import("./referral.server");
    return await referralStatsFor(context.userId);
  });
