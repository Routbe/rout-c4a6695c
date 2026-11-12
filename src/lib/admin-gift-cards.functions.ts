import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";
import { giftIssueSchema } from "./gift-issue-rules";

/** Adminlijst met fysieke cadeaubon-zendingen (België). */
export const listGiftShipments = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z.object({ openOnly: z.boolean().default(true) }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { fetchGiftShipments } = await import("./admin-gift-cards.server");
    return fetchGiftShipments(data.openOnly);
  });

/** Zet een zending op pending_print / packaged / shipped. */
export const setGiftShipmentStatus = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        giftId: z.string().uuid(),
        status: z.enum(["pending_print", "packaged", "shipped"]),
        trackingCode: z.string().max(64).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { updateGiftShipment } = await import("./admin-gift-cards.server");
    return updateGiftShipment({
      giftId: data.giftId,
      status: data.status,
      trackingCode: data.trackingCode ?? null,
    });
  });

/** Admin geeft zelf een bon uit (bv. actie of compensatie): direct actief, geen betaling. */
export const adminIssueGiftCard = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => giftIssueSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { assertAdminRole, writeAudit } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { issueAdminGift } = await import("./admin-gift-issue.server");
    const { giftMailAuditNote } = await import("./admin-gift-issue.server");
    const result = await issueAdminGift(context.userId, String(context.claims.email ?? ""), data);
    await writeAudit({ adminId: context.userId, action: "gift_card_issue", targetLabel: result.code,
      targetUserId: data.recipientUserId ?? null, notes: giftMailAuditNote(data, result.emailed) }).catch(() => undefined);
    return result;
  });

export const adminFindGiftRecipients = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ query: z.string().max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { findGiftRecipients } = await import("./admin-gift-issue.server");
    return findGiftRecipients(data.query);
  });

export const adminResendGift = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().min(4).max(40), input: giftIssueSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertAdminRole, writeAudit } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { resolvePromo } = await import("./promo.server");
    const promo = await resolvePromo(data.code);
    if (!promo) throw new Error("gift_not_available");
    const { sql } = await import("./neon");
    const rows = await sql`select max_redemptions, to_json(expires_at) as expires from public.promo_codes where code = ${data.code} limit 1`;
    const row = rows[0];
    if (!row) throw new Error("gift_not_available");
    const { sendAdminGift, storedGiftRecipient, giftMailAuditNote } = await import("./admin-gift-issue.server");
    const { resendTarget } = await import("./gift-issue-rules");
    // A gift with a stored recipient is only ever re-sent to that recipient.
    const input = resendTarget(await storedGiftRecipient(data.code), { ...data.input, sendEmail: true,
      kind: promo.percentOff > 0 ? "percentage" : "fixed", amountCents: promo.amountOffCents,
      percentOff: promo.percentOff, maxDiscountCents: promo.maxDiscountCents,
      maxRedemptions: Number(row.max_redemptions ?? 1), expiresAt: typeof row.expires === "string" ? row.expires : null });
    const result = await sendAdminGift(context.userId, data.code, input);
    await writeAudit({ adminId: context.userId, action: "gift_card_resend", targetLabel: data.code,
      targetUserId: input.recipientUserId ?? null, notes: giftMailAuditNote(input, result.emailed) }).catch(() => undefined);
    return result;
  });
