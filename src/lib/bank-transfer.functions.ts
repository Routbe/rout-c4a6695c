import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

/** Bankgegevens van de bunq-subrekening die bij land + valuta hoort. */
export interface BankTransferDetails {
  currency: string;
  holder: string | null;
  iban: string | null;
  bic: string | null;
  routingNumber: string | null;
  sortCode: string | null;
  accountNumber: string | null;
  description: string;
  /**
   * `true` wanneer er geen lokale land-IBAN bestaat en we de centrale
   * EUR-hoofdrekening (BE/NL) tonen — SEPA-overschrijvingen uit de hele EU zijn
   * dan gratis en universeel geldig.
   */
  sepaFallback?: boolean;
  /** Pix-sleutel (BRL) wanneer geconfigureerd — voor de lokale BR Code. */
  pixKey?: string | null;
  /** Stad van de begunstigde, verplicht veld in de Pix BR Code. */
  pixCity?: string | null;
  /** UPI Virtual Payment Address (INR) wanneer geconfigureerd. */
  upiVpa?: string | null;
}

/**
 * Haalt de land-/valuta-specifieke bunq-subrekening op voor een
 * bankoverschrijving.
 *
 * - SEPA-landen krijgen ALTIJD bankgegevens: lokale land-IBAN indien aanwezig,
 *   anders de centrale EUR-hoofdrekening.
 * - Vreemde valuta zonder subrekening → `ok: false` met `reason: "bunqme"` en,
 *   als het lukt, een dynamische bunq.me-betaallink in die valuta.
 */
export const getBankTransferDetails = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        country: z.string().trim().min(2).max(20),
        /**
         * ROUT-referentie van de eigen openstaande betaling. Het bedrag van
         * een bunq.me-verzoek komt altijd van de server (opgeslagen betaling
         * of standaardprijs), nooit uit de browser.
         */
        reference: z.string().trim().max(64).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { currencyForCountry, isSepaCountry } = await import("./bunq-currency");
    const currency = currencyForCountry(data.country);
    const sepaCountry = isSepaCountry(data.country) || currency === "EUR";
    const {
      bunqConfigured,
      listMonetaryAccounts,
      resolveTransferRoute,
      ensureMonetaryAccountForCurrency,
      createBunqMeTab,
    } = await import("./bunq.server");

    if (!bunqConfigured()) {
      return { ok: false as const, reason: "not_configured" as const, currency, sepaCountry };
    }

    // Lokale betaalsleutels (Pix/UPI) staan los van bunq: ze werken ook wanneer
    // bunq geen rekening in die valuta wil openen.
    const pixKey = process.env["PIX_KEY"] ?? null;
    const pixCity = process.env["PIX_CITY"] ?? null;
    const upiVpa = process.env["UPI_VPA"] ?? null;

    const toDetails = (
      account: Awaited<ReturnType<typeof listMonetaryAccounts>>[number],
      sepaFallback: boolean,
    ): BankTransferDetails => ({
      currency: account.currency,
      holder: account.holder,
      iban: account.iban,
      bic: account.bic,
      routingNumber: account.routingNumber,
      sortCode: account.sortCode,
      accountNumber: account.accountNumber,
      description: account.description,
      sepaFallback,
      pixKey: currency === "BRL" ? pixKey : null,
      pixCity: currency === "BRL" ? pixCity : null,
      upiVpa: currency === "INR" ? upiVpa : null,
    });

    try {
      const accounts = await listMonetaryAccounts();
      const route = resolveTransferRoute(accounts, currency, data.country, { sepaCountry });

      if (route.kind === "none") {
        // Geen subrekening in deze valuta: laat bunq er automatisch één
        // aanmaken en gebruik meteen de verse lokale bankgegevens.
        try {
          const provisioned = await ensureMonetaryAccountForCurrency(currency, data.country);
          if (
            !provisioned.foreignCurrencyFallback &&
            (provisioned.account.iban || provisioned.account.accountNumber)
          ) {
            return {
              ok: true as const,
              details: toDetails(provisioned.account, false),
              currency: provisioned.account.currency,
              sepaCountry,
              provisioned: provisioned.created,
            };
          }
        } catch (err) {
          console.error("[bank-transfer] automatische valuta-rekening mislukt", err);
        }

        // Lokale standaard vóór bunq.me: Pix (BRL) en UPI (INR) werken zonder
        // dat bunq een rekening in die valuta hoeft te openen.
        const localKey =
          currency === "BRL" && pixKey ? "pix" : currency === "INR" && upiVpa ? "upi" : null;
        if (localKey) {
          return {
            ok: true as const,
            details: {
              currency,
              holder: process.env["PAYMENT_BENEFICIARY"] ?? "ROUT",
              iban: null,
              bic: null,
              routingNumber: null,
              sortCode: null,
              accountNumber: null,
              description: localKey === "pix" ? "ROUT Pix" : "ROUT UPI",
              sepaFallback: false,
              pixKey: localKey === "pix" ? pixKey : null,
              pixCity: localKey === "pix" ? pixCity : null,
              upiVpa: localKey === "upi" ? upiVpa : null,
            } satisfies BankTransferDetails,
            currency,
            sepaCountry,
            provisioned: false,
          };
        }

        // Laatste vangnet: dynamisch bunq.me-verzoek in die valuta.

        try {
          // Server-owned amount: the member's own open payment with this
          // reference, otherwise today's standard price for a transfer.
          const { sql } = await import("./neon");
          const rows = data.reference
            ? ((await sql`
                select amount_cents, donation_cents, reference_code
                  from public.verification_payments
                 where user_id = ${context.userId}
                   and reference_code = ${data.reference}
                   and status in ('pending', 'processing')
                 order by created_at desc
                 limit 1
              `) as { amount_cents: unknown; donation_cents: unknown; reference_code: string | null }[])
            : [];
          const stored = rows[0] ?? null;
          const { bankRequestAmountCents } = await import("./payment-amount-policy");
          const standardCents = stored
            ? 0
            : await (await import("./referral-discount.server")).bestPriceCents("sepa", null, context.userId);
          const amountCents = bankRequestAmountCents(
            stored ? { amountCents: stored.amount_cents, donationCents: stored.donation_cents } : null,
            standardCents,
          );
          if (amountCents === null) {
            return { ok: false as const, reason: "no_local_account" as const, currency, sepaCountry };
          }
          const tab = await createBunqMeTab({
            amountCents,
            description: stored?.reference_code ? `ROUT ${stored.reference_code}` : "ROUT verificatie",
            currency,
            country: data.country,
          });
          return {
            ok: false as const,
            reason: "bunqme" as const,
            currency,
            sepaCountry,
            bunqme: { shareUrl: tab.shareUrl, currency: tab.currency },
          };
        } catch (err) {
          console.error("[bank-transfer] bunq.me-fallback mislukt", err);
          return { ok: false as const, reason: "no_local_account" as const, currency, sepaCountry };
        }
      }

      return {
        ok: true as const,
        details: toDetails(route.account, route.kind === "sepa_main"),
        currency: route.account.currency,
        sepaCountry,
        provisioned: false,
      };
    } catch (err) {
      console.error("[bank-transfer] monetary-account lookup mislukt", err);
      return { ok: false as const, reason: "lookup_failed" as const, currency, sepaCountry };
    }
  });
