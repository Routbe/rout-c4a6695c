/**
 * Eén plek die de Brevo-sleutel valideert (mail én SMS).
 *
 * Doel: nooit stil falen. Ontbreekt `BREVO_API_KEY`, of heeft hij niet het
 * verwachte formaat, dan krijgt de aanroeper een expliciete, leesbare fout in
 * plaats van een vage `sent: false`.
 */

/** Brevo v3-sleutels beginnen met `xkeysib-` (SMTP-sleutels met `xsmtpsib-`). */
const KEY_PATTERN = /^xkeysib-[A-Za-z0-9]{16,}/;

export interface BrevoKeyStatus {
  key: string | null;
  /** Leesbare reden waarom er niet verzonden kan worden, of `null`. */
  error: string | null;
}

/** Leest en valideert de sleutel. Roep dit aan binnen een handler, niet op moduleniveau. */
export function brevoKeyStatus(): BrevoKeyStatus {
  const raw = process.env["BREVO_API_KEY"];
  const key = typeof raw === "string" ? raw.trim() : "";

  if (key.length === 0) {
    return {
      key: null,
      error:
        "BREVO_API_KEY ontbreekt: er kan geen e-mail of SMS verzonden worden. " +
        "Zet de sleutel in de omgevingsvariabelen van deze deployment.",
    };
  }
  if (key.startsWith("xsmtpsib-")) {
    return {
      key: null,
      error:
        "BREVO_API_KEY bevat een SMTP-sleutel (xsmtpsib-…). De transactionele API " +
        "vereist een v3 API-sleutel die met 'xkeysib-' begint.",
    };
  }
  if (!KEY_PATTERN.test(key)) {
    return {
      key: null,
      error:
        "BREVO_API_KEY heeft een ongeldig formaat: verwacht een v3-sleutel die met " +
        "'xkeysib-' begint. Genereer een nieuwe sleutel in Brevo > SMTP & API.",
    };
  }
  return { key, error: null };
}

/** Vertaalt een HTTP-antwoord van Brevo naar een expliciete oorzaak. */
export function describeBrevoFailure(status: number, body: string): string {
  const detail = body.slice(0, 300);
  if (status === 401)
    return `BREVO_API_KEY is ongeldig of ingetrokken (401 van Brevo). Vernieuw de sleutel. ${detail}`;
  if (status === 403)
    return `BREVO_API_KEY mist rechten voor deze actie (403 van Brevo). ${detail}`;
  if (status === 402) return `Brevo-account heeft onvoldoende krediet (402). ${detail}`;
  return `Brevo weigerde het bericht (${status}): ${detail}`;
}
