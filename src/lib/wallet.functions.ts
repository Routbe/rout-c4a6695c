import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";
import { walletTopupAmountSchema } from "@/lib/wallet-tiers";

/** RPC-laag voor de SecureShield prepaid wallet. Alles vereist een sessie. */

export const topupSchema = z
  .object({
    amountCents: walletTopupAmountSchema,
    origin: z.string().url().max(300),
  })
  .strict();

export const autoTopupSchema = z
  .object({
    enabled: z.boolean(),
    amountCents: walletTopupAmountSchema,
  })
  .strict();

export const getWallet = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { readWallet } = await import("./wallet.server");
    return readWallet(context.userId);
  });

export const startWalletTopupCheckout = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => topupSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { trustedCheckoutOrigin } = await import("./verification.server");
    const { isMinorUser, requestParentPayment } = await import("./minor-safety.server");
    if (await isMinorUser(context.userId)) {
      const mailed = await requestParentPayment(context.userId, {
        kind: "wallet_topup",
        label: `ROUT-tegoed opwaarderen`,
        amountCents: data.amountCents,
      });
      return mailed
        ? { ok: false as const, reason: "parent_approval_sent" }
        : { ok: false as const, reason: "parent_approval_failed" };
    }
    const { startWalletTopup } = await import("./wallet.server");
    const origin = trustedCheckoutOrigin(getRequest(), data.origin);
    return startWalletTopup({
      userId: context.userId,
      amountCents: data.amountCents,
      origin,
    });
  });

export const updateWalletAutoTopup = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => autoTopupSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { setAutoTopup, readWallet } = await import("./wallet.server");
    await setAutoTopup(context.userId, data.enabled, data.amountCents);
    return readWallet(context.userId);
  });
