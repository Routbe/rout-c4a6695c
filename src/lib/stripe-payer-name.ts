/**
 * Bank-bevestigde betalernaam uit een Stripe-charge (pure module).
 *
 * Regel: we vertrouwen **uitsluitend** de naam die de bank van de betaler ons
 * doorgeeft. `billing_details.name` typt de klant zelf in het afrekenscherm en
 * is dus vervalsbaar — die naam wordt hier nooit teruggegeven.
 *
 * Betaalmethodes die wél een geverifieerde naam meesturen (`verified_name`
 * komt rechtstreeks van de bank van de klant):
 *   iDEAL, Bancontact, SOFORT, EPS, Przelewy24, giropay
 * SEPA-domiciliëring en kaarten leveren geen bankbevestigde naam: die vallen
 * terug op `null` en gaan dus naar handmatige controle.
 */

export type PayerNameSource =
  | "ideal"
  | "bancontact"
  | "sofort"
  | "eps"
  | "p24"
  | "giropay"
  | "sepa_credit_transfer"
  | "customer_balance";

export interface StripePayerName {
  /** De naam zoals de bank hem doorgaf, of `null` als de bank er geen gaf. */
  name: string | null;
  /** Betaalmethode die de naam leverde, of `null`. */
  source: PayerNameSource | null;
  /** Betaalmethode van de charge, ook als die geen naam levert (bv. `card`). */
  method: string | null;
}

/** Methodes waarvan `verified_name` door de bank van de klant wordt gezet. */
const BANK_VERIFIED: PayerNameSource[] = [
  "ideal",
  "bancontact",
  "sofort",
  "eps",
  "p24",
  "giropay",
  "sepa_credit_transfer",
  "customer_balance",
];

type Obj = Record<string, unknown>;

const asObject = (value: unknown): Obj | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Obj) : null;

const asString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Haalt de bankbevestigde naam uit een charge-object (of uit een payment intent
 * met een uitgeklapte `latest_charge`).
 */
export function payerNameFromCharge(charge: unknown): StripePayerName {
  const object = asObject(charge);
  if (!object) return { name: null, source: null, method: null };

  // Payment intent met expand[]=latest_charge.
  const latest = asObject(object["latest_charge"]);
  if (latest) return payerNameFromCharge(latest);

  const details = asObject(object["payment_method_details"]);
  if (!details) return { name: null, source: null, method: null };

  const method = asString(details["type"]);

  for (const source of BANK_VERIFIED) {
    const block = asObject(details[source]);
    if (!block) continue;
    const verified =
      asString(block["verified_name"]) ??
      // customer_balance / SEPA credit transfer noemen het anders.
      asString(asObject(block["eu_bank_transfer"])?.["sender_name"]) ??
      asString(block["sender_name"]);
    if (verified) return { name: verified, source, method: method ?? source };
  }

  return { name: null, source: null, method };
}
