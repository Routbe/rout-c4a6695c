import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

/** RPC-laag voor makersdonaties. De publieke calls hebben geen sessie nodig. */

const startSchema = z.object({
  handle: z.string().trim().min(2).max(40),
  amountCents: z.number().int().min(100).max(500_000),
  message: z.string().trim().max(500).optional().nullable(),
  supporterName: z.string().trim().max(80).optional().nullable(),
  supporterEmail: z.string().trim().email().max(200).optional().nullable(),
  origin: z.string().url().max(300),
  altcha: z.string().max(4000).optional().nullable(),
});

export const getDonationTarget = createServerFn({ method: "GET" })
  .inputValidator((input: { handle: string }) => input)
  .handler(async ({ data }) => {
    const { readDonationTarget } = await import("./donations.server");
    return readDonationTarget(data.handle);
  });

export const startDonationCheckout = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => startSchema.parse(input))
  .handler(async ({ data }) => {
    // Botbescherming vóór we een Stripe-sessie aanmaken.
    const { assertHuman } = await import("./altcha.server");
    await assertHuman(data.altcha ?? null);
    const { getRequest } = await import("@tanstack/react-start/server");
    const { trustedCheckoutOrigin } = await import("./verification.server");
    const { startDonation } = await import("./donations.server");
    const origin = trustedCheckoutOrigin(getRequest(), data.origin);
    return startDonation({
      handle: data.handle,
      amountCents: data.amountCents,
      message: data.message ?? null,
      supporterName: data.supporterName ?? null,
      supporterEmail: data.supporterEmail ?? null,
      origin,
    });
  });

export const getDonationStatus = createServerFn({ method: "GET" })
  .inputValidator((input: { donationId: string }) => input)
  .handler(async ({ data }) => {
    const { readDonationStatus } = await import("./donations.server");
    return readDonationStatus(data.donationId);
  });

/** Overzicht van ontvangen steun voor de ingelogde maker. */
export const getMyDonations = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { readMyDonations } = await import("./donations.server");
    return readMyDonations(context.userId);
  });
