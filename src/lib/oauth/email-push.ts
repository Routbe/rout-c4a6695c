/**
 * Pure rules for "pass my e-mail change on to my apps" (Account & Security).
 * Browser-safe: the panel uses the labels, the server uses the outcome rule.
 */

export type WebhookDelivery = "ok" | "failed" | "none";

/**
 * What the member sees per app after a push:
 * - notified: the app's webhook confirmed the new address (2xx).
 * - next_login: no webhook; the app gets the new address at its next sign-in.
 * - delivery_failed: the webhook did not answer OK; the app still gets it at its next sign-in.
 * - unchanged: the app already had this address.
 * - unavailable: the chosen address is not available for this app (nothing changed).
 * - no_consent: the app has no permission to see your e-mail (nothing sent).
 */
export type PushOutcome = "notified" | "next_login" | "delivery_failed" | "unchanged" | "unavailable" | "no_consent";

export function pushOutcome(input: {
  consented: boolean;
  available: boolean;
  previous: string | null;
  next: string | null;
  delivery: WebhookDelivery;
}): PushOutcome {
  if (!input.consented) return "no_consent";
  if (!input.available || !input.next) return "unavailable";
  if ((input.previous ?? "").toLowerCase() === input.next.toLowerCase()) return "unchanged";
  if (input.delivery === "ok") return "notified";
  return input.delivery === "failed" ? "delivery_failed" : "next_login";
}

export const PUSH_OUTCOME_LABEL: Record<PushOutcome, string> = {
  notified: "Op de hoogte gebracht",
  next_login: "Krijgt het bij de volgende login",
  delivery_failed: "Melding mislukt · krijgt het bij de volgende login",
  unchanged: "Had dit adres al",
  unavailable: "Dit adres is niet beschikbaar voor deze app",
  no_consent: "Mag je e-mailadres niet zien",
};
