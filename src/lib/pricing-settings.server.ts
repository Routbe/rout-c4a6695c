/**
 * Server-only lezer/schrijver van het dynamische prijsbeleid.
 *
 * Eén rij (`id = 1`) in `public.pricing_settings`; de waarden worden 60 seconden
 * in het geheugen gecached zodat de checkout ze zonder extra latency uitleest.
 * Faalt de database, dan valt alles terug op de defaults — de checkout blijft
 * dus altijd een geldige prijs tonen.
 */
import { sql } from "@/lib/neon";
import { DEFAULT_PRICING, sanitizePricing, type PricingSettings } from "./pricing-settings";

const CACHE_MS = 60_000;
let cache: { value: PricingSettings; at: number } | null = null;

type Row = Record<string, unknown>;

/** Actuele prijzen, met cache en defaults als vangnet. */
export async function getPricing(force = false): Promise<PricingSettings> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  try {
    const rows = (await sql`
      select verification_base_cents, fee_card_cents, fee_bunq_cents, fee_sepa_cents, min_donation_cents
        from public.pricing_settings where id = 1 limit 1
    `) as Row[];
    const row = rows[0];
    const value = sanitizePricing(
      row
        ? {
            baseCents: Number(row["verification_base_cents"]),
            feeCents: {
              card: Number(row["fee_card_cents"]),
              bunq: Number(row["fee_bunq_cents"]),
              sepa: Number(row["fee_sepa_cents"]),
            },
            minDonationCents: Number(row["min_donation_cents"]),
          }
        : null,
    );
    cache = { value, at: Date.now() };
    return value;
  } catch (error) {
    console.error("[pricing] kon prijzen niet laden, defaults gebruikt", error);
    return DEFAULT_PRICING;
  }
}

/** Schrijft nieuwe prijzen weg en ververst de cache direct. */
export async function savePricing(
  input: Partial<PricingSettings>,
  updatedBy: string | null,
): Promise<PricingSettings> {
  const value = sanitizePricing(input);
  await sql`
    insert into public.pricing_settings
      (id, verification_base_cents, fee_card_cents, fee_bunq_cents, fee_sepa_cents, min_donation_cents, updated_at, updated_by)
    values (1, ${value.baseCents}, ${value.feeCents.card}, ${value.feeCents.bunq},
            ${value.feeCents.sepa}, ${value.minDonationCents}, now(), ${updatedBy})
    on conflict (id) do update set
      verification_base_cents = excluded.verification_base_cents,
      fee_card_cents = excluded.fee_card_cents,
      fee_bunq_cents = excluded.fee_bunq_cents,
      fee_sepa_cents = excluded.fee_sepa_cents,
      min_donation_cents = excluded.min_donation_cents,
      updated_at = now(),
      updated_by = excluded.updated_by
  `;
  cache = { value, at: Date.now() };
  return value;
}
