import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

const bunqCheckoutSchema = z.object({
  country: z.string().trim().min(2).max(20),
  donationPlan: z.enum(["none", "one_time", "monthly", "yearly"]).optional(),
  donationCents: z.number().int().min(0).max(100_000).optional(),
  legalName: z.string().trim().min(3).max(120),
  promoCode: z.string().max(64).optional(),
  /** Idempotency-sleutel van deze checkout-sessie (UUID uit de client). */
  clientRequestId: z.string().trim().min(8).max(64).optional(),
});

/**
 * bunq-checkout: maakt een pending verificatiebetaling met ROUT-referentie en
 * vraagt bij bunq altijd een bunq.me-betaalverzoek aan — ongeacht land of
 * valuta. De tab staat in EUR; er is geen handmatige IBAN-fallback meer.
 */
export const startBunqVerification = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => bunqCheckoutSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { emailConfirmed } = await import("./email-confirmed");
    if (!emailConfirmed(context.claims)) {
      return { ok: false as const, reason: "email_unconfirmed" as const };
    }

    const { bunqConfigured } = await import("./bunq.server");
    if (!bunqConfigured()) {
      return { ok: false as const, reason: "bunq_not_configured" as const };
    }

    const { normalizeDonationPlan, saveLegalName } = await import("./verification.server");
    const legal = await saveLegalName(context.userId, data.legalName);
    if (!legal.ok) return { ok: false as const, reason: legal.reason };

    const { clampContribution } = await import("./contributions");
    const { dbAdmin } = await import("@/lib/db/admin.server");
    const { resolvePromo } = await import("./promo.server");
    const { bestPriceCents } = await import("./referral-discount.server");

    const donationPlan = normalizeDonationPlan(data.donationPlan ?? "none");
    // Een bunq.me-verzoek is een eenmalig betaalverzoek: een eventuele
    // terugkerende donatie reist eenmalig mee in hetzelfde verzoek.
    const donationCents = clampContribution(donationPlan, data.donationCents ?? null);
    const promo = await resolvePromo(data.promoCode ?? null);
    const baseCents = await bestPriceCents("bunq", promo, context.userId);
    const totalCents = baseCents + donationCents;

    const reference = `ROUT-${Math.floor(1000 + Math.random() * 9000)}`;

    const { data: payment, error } = await dbAdmin
      .from("verification_payments")
      .insert({
        user_id: context.userId,
        tier: "early_believer",
        amount_cents: baseCents,
        donation_cents: donationCents,
        donation_plan: donationPlan,
        provider: "bunq",
        reference_code: reference,
      })
      .select("id")
      .single();
    if (error || !payment) {
      console.error("[bunq] payment insert failed", error);
      return { ok: false as const, reason: "payment_record_failed" as const };
    }

    if (totalCents === 0) {
      const { activateVerification } = await import("./verification.server");
      await activateVerification(payment.id, `promo:${promo?.code ?? "free"}`);
      if (promo) {
        const { recordPromoRedemption } = await import("./promo.server");
        await recordPromoRedemption(promo.code);
      }
      return { ok: true as const, free: true as const, reference, totalCents };
    }

    try {
      const { createBunqMeTab } = await import("./bunq.server");
      const { currencyForCountry } = await import("./bunq-currency");
      const currency = currencyForCountry(data.country);
      const tab = await createBunqMeTab({
        amountCents: totalCents,
        description: `ROUT Early Believer ${reference}`,
        currency,
        country: data.country,
        clientRequestId: data.clientRequestId,
      });
      // Bewaar tab + rekening zodat de polling de status kan uitlezen.
      const { sql } = await import("./neon");
      await sql`
        update public.verification_payments
           set provider_ref = ${`bunqme:${tab.account.id}:${tab.tabId}`}, updated_at = now()
         where id = ${payment.id}
      `;
      return {
        ok: true as const,
        free: false as const,
        shareUrl: tab.shareUrl,
        reference,
        totalCents,
        currency: tab.currency,
        iban: tab.account.iban,
        foreignCurrencyFallback: tab.foreignCurrencyFallback,
        paymentId: payment.id as string,
        tabId: tab.tabId,
        accountId: tab.account.id,
      };
    } catch (err) {
      console.error("[bunq] bunq.me-tab failed", err);
      // De pending betaling blijft bestaan; de client toont de SEPA-fallback.
      return { ok: false as const, reason: "bunq_request_failed" as const, reference };
    }
  });

/**
 * Hervat een openstaand bunq-betaalverzoek.
 *
 * De pending rij in `verification_payments` is de bron van waarheid: bij het
 * starten van de checkout is die al aangemaakt met `provider_ref =
 * bunqme:<accountId>:<tabId>`. Verlaat de gebruiker de pagina of herlaadt hij
 * het tabblad, dan geeft deze functie de tab + share-URL terug zodat de QR en
 * de polling meteen doorlopen — het betaalvenster verdwijnt dus nooit.
 *
 * Is de betaling ondertussen al binnen (bijv. via de webhook of een betaling
 * binnen 30 seconden), dan wordt de verificatie hier direct geactiveerd.
 */
export const resumeBunqPayment = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { dbAdmin } = await import("@/lib/db/admin.server");
    const { data: row } = await dbAdmin
      .from("verification_payments")
      .select("id, status, provider, provider_ref, reference_code, amount_cents, donation_cents")
      .eq("user_id", context.userId)
      .eq("provider", "bunq")
      .in("status", ["pending", "processing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!row) return { ok: true as const, open: false as const };

    const ref = String(row.provider_ref ?? "");
    const match = /^bunqme:(\d+):(\d+)$/.exec(ref);
    if (!match) return { ok: true as const, open: false as const };
    const accountId = Number(match[1]);
    const tabId = Number(match[2]);

    const totalCents = Number(row.amount_cents ?? 0) + Number(row.donation_cents ?? 0);

    try {
      const { readBunqMeTabStatus } = await import("./bunq.server");
      const tab = await readBunqMeTabStatus(accountId, tabId);
      if (tab.paid) {
        const { activateVerification } = await import("./verification.server");
        await activateVerification(String(row.id), `bunqme_tab:${accountId}:${tabId}`);
        return { ok: true as const, open: false as const, paid: true as const };
      }
      if (!tab.shareUrl) return { ok: true as const, open: false as const };
      return {
        ok: true as const,
        open: true as const,
        shareUrl: tab.shareUrl,
        reference: (row.reference_code as string | null) ?? null,
        totalCents,
        paymentId: String(row.id),
        tabId,
        accountId,
      };
    } catch (err) {
      console.error("[bunq] resume failed", err);
      return { ok: false as const, open: false as const };
    }
  });

/** Compacte bunq API-status voor de admin (SessionServer-check). */

export const getBunqApiHealth = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { bunqConfigured, checkBunqApiStatus } = await import("./bunq.server");
    if (!bunqConfigured()) {
      return { ok: false, status: 0, message: "Niet geconfigureerd", configured: false };
    }
    const result = await checkBunqApiStatus();
    return { ...result, configured: true };
  });
