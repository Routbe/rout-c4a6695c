/**
 * Vaste opwaardeerstaffel voor de SecureShield wallet (pure, client-veilig).
 *
 * De client kiest alleen één van deze staffels; de server maakt de betaling
 * aan met dit exacte bedrag en schrijft pas saldo bij wanneer de betaalprovider
 * bevestigt dat precies dit bedrag in EUR is betaald.
 */
import { z } from "zod";

export const WALLET_TOPUP_TIERS_CENTS = [1000, 2500, 5000, 10000, 25000] as const;
export type WalletTopupCents = (typeof WALLET_TOPUP_TIERS_CENTS)[number];

export const WALLET_TOPUP_MIN_CENTS = WALLET_TOPUP_TIERS_CENTS[0];
export const WALLET_TOPUP_MAX_CENTS = WALLET_TOPUP_TIERS_CENTS[4];
export const WALLET_TOPUP_CURRENCY = "eur";

export function isWalletTopupTier(value: unknown): value is WalletTopupCents {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (WALLET_TOPUP_TIERS_CENTS as readonly number[]).includes(value)
  );
}

/** Zod-schema dat alleen een exacte staffel accepteert. */
export const walletTopupAmountSchema = z
  .number()
  .int()
  .refine(isWalletTopupTier, { message: "Kies een van de vaste bedragen: €10, €25, €50, €100 of €250." });

/** Bewaarde auto-bijvulbedragen van vóór de staffel worden naar de dichtstbijzijnde staffel gebracht. */
export function normaliseAutoTopupCents(value: number): WalletTopupCents {
  if (isWalletTopupTier(value)) return value;
  let best: WalletTopupCents = WALLET_TOPUP_TIERS_CENTS[0];
  for (const tier of WALLET_TOPUP_TIERS_CENTS) {
    if (Math.abs(tier - value) < Math.abs(best - value)) best = tier;
  }
  return best;
}

/**
 * Bepaalt het bij te schrijven bedrag uit een betaalbevestiging. Geeft `null`
 * terug (niet bijschrijven) zodra het gevraagde bedrag geen staffel is, de
 * munt geen EUR is, of het werkelijk betaalde bedrag afwijkt.
 */
export function verifiedTopupCredit(input: {
  requestedCents: unknown;
  paidCents: unknown;
  currency: unknown;
}): WalletTopupCents | null {
  const requested = Number(input.requestedCents);
  const paid = Number(input.paidCents);
  if (!isWalletTopupTier(requested)) return null;
  if (String(input.currency ?? "").toLowerCase() !== WALLET_TOPUP_CURRENCY) return null;
  if (!Number.isInteger(paid) || paid !== requested) return null;
  return requested;
}
