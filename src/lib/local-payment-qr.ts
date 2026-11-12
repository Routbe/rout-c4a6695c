/**
 * Lokale betaal-QR per valuta.
 *
 * - EUR (SEPA) → EPC069-12-payload, herkend door elke Europese bank-app.
 * - BRL → Pix "BR Code" (EMV-MPM, BCB-standaard) met CRC16.
 * - INR → UPI deep link (`upi://pay?...`), herkend door elke UPI-app.
 * - Andere valuta → een gestructureerde, machineleesbare betaalinstructie met
 *   de lokale routinggegevens (routing number, sort code, rekeningnummer of
 *   IBAN). Bank-apps die geen EPC kennen, tonen deze velden als tekst zodat de
 *   betaler niets hoeft over te typen.
 */
import { buildEpcPayload } from "./epc-qr";
import { hasUsablePaymentDetails, isValidPixKey, isValidUpiVpa } from "./payment-validation";

export interface LocalPaymentQrInput {
  beneficiary: string;
  currency: string;
  amountCents: number;
  reference: string;
  iban?: string | null;
  bic?: string | null;
  routingNumber?: string | null;
  sortCode?: string | null;
  accountNumber?: string | null;
  /** Pix-sleutel voor BRL-betalingen (e-mail, telefoon, CPF/CNPJ of EVP). */
  pixKey?: string | null;
  /** Stad van de begunstigde — verplicht veld in de Pix BR Code. */
  pixCity?: string | null;
  /** UPI Virtual Payment Address voor INR-betalingen. */
  upiVpa?: string | null;
}

export interface LocalPaymentQr {
  payload: string;
  /** Korte naam van de gebruikte standaard, voor het label onder de QR. */
  standard: string;
  hint: string;
}

function amountString(amountCents: number): string {
  return (amountCents / 100).toFixed(2);
}

/** EMV-MPM veld: `id` + lengte (2 cijfers) + waarde. */
function emv(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

/** CRC16/CCITT-FALSE, zoals de Pix-specificatie voorschrijft. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** ASCII-only, hoofdletters, zonder accenten — Pix accepteert niets anders. */
function pixText(value: string, max: number): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, max);
}

/** Pix BR Code (statisch, met bedrag en txid). */
export function buildPixPayload(input: {
  pixKey: string;
  beneficiary: string;
  city?: string | null;
  amountCents: number;
  reference: string;
}): string | null {
  if (!isValidPixKey(input.pixKey)) return null;
  const txid = pixText(input.reference, 25).replace(/ /g, "") || "***";
  const body =
    emv("00", "01") +
    emv("26", emv("00", "BR.GOV.BCB.PIX") + emv("01", input.pixKey.trim())) +
    emv("52", "0000") +
    emv("53", "986") +
    (input.amountCents > 0 ? emv("54", amountString(input.amountCents)) : "") +
    emv("58", "BR") +
    emv("59", pixText(input.beneficiary, 25) || "ROUT") +
    emv("60", pixText(input.city ?? "SAO PAULO", 15) || "SAO PAULO") +
    emv("62", emv("05", txid));
  const withCrcId = `${body}6304`;
  return `${withCrcId}${crc16(withCrcId)}`;
}

/** UPI deep link volgens de NPCI-URL-specificatie. */
export function buildUpiPayload(input: {
  vpa: string;
  beneficiary: string;
  amountCents: number;
  reference: string;
}): string | null {
  if (!isValidUpiVpa(input.vpa)) return null;
  const params = new URLSearchParams({
    pa: input.vpa.trim(),
    pn: input.beneficiary.slice(0, 50),
    am: amountString(input.amountCents),
    cu: "INR",
    tn: input.reference.slice(0, 50),
    tr: input.reference.replace(/[^A-Za-z0-9]/g, "").slice(0, 35),
  });
  return `upi://pay?${params.toString()}`;
}

export function buildLocalPaymentQr(input: LocalPaymentQrInput): LocalPaymentQr | null {
  const currency = (input.currency || "EUR").toUpperCase();

  if (currency === "BRL" && input.pixKey) {
    const payload = buildPixPayload({
      pixKey: input.pixKey,
      beneficiary: input.beneficiary,
      city: input.pixCity ?? null,
      amountCents: input.amountCents,
      reference: input.reference,
    });
    if (payload) {
      return {
        payload,
        standard: "Pix (BR Code)",
        hint: "Scan met je bank-app in Brazilië — bedrag en identificatie staan al klaar.",
      };
    }
  }

  if (currency === "INR" && input.upiVpa) {
    const payload = buildUpiPayload({
      vpa: input.upiVpa,
      beneficiary: input.beneficiary,
      amountCents: input.amountCents,
      reference: input.reference,
    });
    if (payload) {
      return {
        payload,
        standard: "UPI",
        hint: "Scan met GPay, PhonePe, Paytm of je bank-app — bedrag staat al ingevuld.",
      };
    }
  }

  if (currency === "EUR" && input.iban) {
    const payload = buildEpcPayload({
      beneficiary: input.beneficiary,
      iban: input.iban,
      bic: input.bic ?? "",
      amountCents: input.amountCents,
      reference: input.reference,
    });
    if (!payload) return null;
    return {
      payload,
      standard: "EPC-QR (SEPA-standaard)",
      hint: "Begunstigde, IBAN, bedrag en mededeling worden automatisch ingevuld.",
    };
  }

  // Geen geldige, controleerbare rekeninggegevens → geen QR.
  if (
    !hasUsablePaymentDetails({
      currency,
      iban: input.iban ?? null,
      accountNumber: input.accountNumber ?? null,
      routingNumber: input.routingNumber ?? null,
      sortCode: input.sortCode ?? null,
      pixKey: input.pixKey ?? null,
      upiVpa: input.upiVpa ?? null,
    })
  ) {
    return null;
  }

  const lines = [
    `BENEFICIARY:${input.beneficiary}`,
    `CURRENCY:${currency}`,
    `AMOUNT:${amountString(input.amountCents)}`,
    `REFERENCE:${input.reference}`,
  ];
  if (input.iban) lines.push(`IBAN:${input.iban}`);
  if (input.bic) lines.push(`BIC:${input.bic}`);
  if (input.routingNumber) lines.push(`ROUTING:${input.routingNumber}`);
  if (input.sortCode) lines.push(`SORTCODE:${input.sortCode}`);
  if (input.accountNumber) lines.push(`ACCOUNT:${input.accountNumber}`);

  return {
    payload: lines.join("\n"),
    standard: `Lokale ${currency}-betaalinstructie`,
    hint: "Scan in je bank-app of kopieer de gegevens hieronder.",
  };
}
