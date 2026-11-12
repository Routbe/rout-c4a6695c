/**
 * Naamcontrole op Stripe-betalingen (server-only).
 *
 * Voor verificatiebetalingen telt alleen de naam die de **bank** ons doorgeeft
 * bij het binnenkomen van het geld. De naam die het lid zelf invulde (profiel,
 * afrekenformulier, kaarthouder) wordt nooit als bewijs gebruikt: die is
 * vervalsbaar. Levert de betaalmethode geen bankbevestigde naam (kaart,
 * domiciliëring), dan activeren we niets automatisch maar zetten we de betaling
 * in de handmatige reviewwachtrij.
 */
import { matchPayerName } from "./sepa-name-match";
import { payerNameFromCharge, type StripePayerName } from "./stripe-payer-name";
import { queueSepaReview } from "./sepa-review.server";

export type PayerNameVerdict =
  | { ok: true; payerName: string; holderName: string | null; score: number }
  | {
      ok: false;
      reason: "no_bank_name" | "name_mismatch" | "lookup_failed";
      payerName: string | null;
      holderName: string | null;
      score: number;
      method: string | null;
    };

interface PaymentRow {
  id: string;
  user_id: string;
  amount_cents: number | null;
  donation_cents: number | null;
  reference_code: string | null;
}

/** Haalt de charge (met bankgegevens) op bij Stripe. */
export async function fetchStripePayerName(reference: string | null): Promise<StripePayerName> {
  const empty: StripePayerName = { name: null, source: null, method: null };
  if (!reference) return empty;

  const { stripeKey } = await import("./verification.server");
  const key = stripeKey();
  if (!key) return empty;

  const url = reference.startsWith("cs_")
    ? `https://api.stripe.com/v1/checkout/sessions/${reference}?expand[]=payment_intent.latest_charge`
    : reference.startsWith("ch_")
      ? `https://api.stripe.com/v1/charges/${reference}`
      : `https://api.stripe.com/v1/payment_intents/${reference}?expand[]=latest_charge`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) {
    console.error("[stripe-payer-name] ophalen mislukt", { reference, status: res.status });
    return empty;
  }
  const json = (await res.json()) as Record<string, unknown>;
  const intent = json["payment_intent"];
  return payerNameFromCharge(intent && typeof intent === "object" ? intent : json);
}

async function accountHolderName(userId: string): Promise<string | null> {
  try {
    const { dbAdmin } = await import("@/lib/db/admin.server");
    const { data } = await dbAdmin
      .from("profiles")
      .select("verified_legal_name, display_name, full_name" as "*")
      .eq("id", userId)
      .maybeSingle();
    const row = (data ?? null) as Record<string, unknown> | null;
    return (
      ((row?.["verified_legal_name"] as string | null) ??
        (row?.["display_name"] as string | null) ??
        (row?.["full_name"] as string | null)) ||
      null
    );
  } catch {
    return null;
  }
}

/**
 * Poortwachter vóór het activeren van een verificatiebetaling.
 *
 * Geeft `ok: true` alleen terug wanneer de bank een naam meestuurde die sterk
 * overeenkomt met de naam van de rekeninghouder. In alle andere gevallen wordt
 * de betaling op `processing` gezet, in de reviewwachtrij geplaatst en de admin
 * verwittigd — er wordt niets geactiveerd.
 */
export async function verifyStripePayerName(opts: {
  paymentId: string;
  reference: string | null;
}): Promise<PayerNameVerdict> {
  const { dbAdmin } = await import("@/lib/db/admin.server");
  const { data } = await dbAdmin
    .from("verification_payments")
    .select("id, user_id, amount_cents, donation_cents, reference_code")
    .eq("id", opts.paymentId)
    .maybeSingle();
  const payment = (data as PaymentRow | null) ?? null;
  if (!payment) {
    return {
      ok: false,
      reason: "lookup_failed",
      payerName: null,
      holderName: null,
      score: 0,
      method: null,
    };
  }

  const expected = (payment.amount_cents ?? 0) + (payment.donation_cents ?? 0);
  const bank = await fetchStripePayerName(opts.reference).catch(() => ({
    name: null,
    source: null,
    method: null,
  }));
  const holderName = await accountHolderName(payment.user_id);

  const hold = async (reason: "no_bank_name" | "name_mismatch", score: number) => {
    await dbAdmin
      .from("verification_payments")
      .update({ status: "processing" })
      .eq("id", payment.id);
    await queueSepaReview({
      paymentId: payment.id,
      userId: payment.user_id,
      reference: payment.reference_code ?? opts.reference,
      amountCents: expected,
      expectedCents: expected,
      payerName: bank.name,
      holderName,
      matchScore: score,
      reason,
      notes: `stripe:${bank.method ?? "unknown"}`,
    });
    console.warn("[stripe-payer-name] activering tegengehouden", {
      paymentId: payment.id,
      reason,
      method: bank.method,
      score,
    });
  };

  if (!bank.name) {
    await hold("no_bank_name", 0);
    return {
      ok: false,
      reason: "no_bank_name",
      payerName: null,
      holderName,
      score: 0,
      method: bank.method,
    };
  }

  const match = matchPayerName(bank.name, holderName);
  if (match.verdict !== "strong") {
    await hold("name_mismatch", match.score);
    return {
      ok: false,
      reason: "name_mismatch",
      payerName: bank.name,
      holderName,
      score: match.score,
      method: bank.method,
    };
  }

  return { ok: true, payerName: bank.name, holderName, score: match.score };
}
