/**
 * BTW-opsplitsing voor facturen (pure module, geen omgeving of database).
 *
 * Alle ROUT-prijzen zijn inclusief btw. Een factuur moet het nettobedrag, de
 * btw en het totaal apart tonen; we rekenen dus terug vanaf het totaal zodat
 * de som altijd exact klopt met wat de klant effectief betaalde.
 */

/** Standaard Belgisch btw-tarief op digitale diensten. */
export const DEFAULT_VAT_RATE = 21;

export interface VatBreakdown {
  netCents: number;
  vatCents: number;
  totalCents: number;
  ratePercent: number;
}

/** Splitst een btw-inclusief totaal in netto + btw (afronding valt in de btw). */
export function vatBreakdown(totalCents: number, ratePercent = DEFAULT_VAT_RATE): VatBreakdown {
  const total = Math.max(0, Math.round(totalCents));
  const rate = Math.max(0, ratePercent);
  const net = Math.round(total / (1 + rate / 100));
  return { netCents: net, vatCents: total - net, totalCents: total, ratePercent: rate };
}
