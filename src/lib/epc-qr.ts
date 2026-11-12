/**
 * EPC-QR ("Scan2Pay" / SEPA Credit Transfer QR) payload builder.
 *
 * Implements EPC069-12 (version 002) exactly as Belgian and EU banking apps
 * expect it: 11 significant lines, LF separated, max 331 bytes, no trailing
 * separator. Several banks (Keytrade among them) reject payloads that contain
 * characters outside the EPC character set, a trailing empty line, or an
 * amount formatted with a comma — this builder normalises all three.
 */

export interface EpcPayloadInput {
  /** Account holder as printed on the bank account. Max 70 chars. */
  beneficiary: string;
  /** IBAN, spaces are stripped automatically. */
  iban: string;
  /** BIC / SWIFT — optional in version 002. */
  bic?: string;
  /** Amount in cents; 0 renders an open-amount QR. */
  amountCents: number;
  /** Unstructured remittance information, e.g. `ROUT-4821`. Max 140 chars. */
  reference: string;
  /** Optional 4-char purpose code (e.g. `OTHR`). */
  purpose?: string;
}

const MAX_BYTES = 331;

/** EPC069-12 allows only this Latin subset; anything else is transliterated. */
const TRANSLITERATE: Record<string, string> = {
  à: "a",
  á: "a",
  â: "a",
  ä: "a",
  ã: "a",
  å: "a",
  è: "e",
  é: "e",
  ê: "e",
  ë: "e",
  ì: "i",
  í: "i",
  î: "i",
  ï: "i",
  ò: "o",
  ó: "o",
  ô: "o",
  ö: "o",
  õ: "o",
  ù: "u",
  ú: "u",
  û: "u",
  ü: "u",
  ç: "c",
  ñ: "n",
  ß: "ss",
  æ: "ae",
  ø: "o",
  œ: "oe",
};

function epcText(value: string, max: number): string {
  const lowered = value.replace(/[\r\n\t]+/g, " ");
  let out = "";
  for (const char of lowered) {
    const mapped = TRANSLITERATE[char] ?? TRANSLITERATE[char.toLowerCase()];
    if (mapped) {
      out += char === char.toLowerCase() ? mapped : mapped.toUpperCase();
      continue;
    }
    // Allowed EPC character set: A-Z a-z 0-9 and / - ? : ( ) . , ' + space
    out += /[A-Za-z0-9/\-?:()., '+]/.test(char) ? char : " ";
  }
  return out
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, max);
}

/** `EUR12.34` — EPC requires a dot decimal separator and at most 2 decimals. */
export function epcAmount(amountCents: number): string {
  const cents = Math.max(0, Math.round(amountCents));
  return `EUR${(cents / 100).toFixed(2)}`;
}

/** Basic IBAN sanity check (length + mod-97) so we never render a dead QR. */
export function isValidIban(raw: string): boolean {
  const iban = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const value = /\d/.test(char) ? char : String(char.charCodeAt(0) - 55);
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

/**
 * Builds the raw text that goes into the QR code. Returns `null` when the
 * mandatory fields are missing/invalid or the payload would exceed the
 * 331-byte limit, so the UI falls back to plain copyable details instead of
 * showing an unscannable code.
 */
export function buildEpcPayload(input: EpcPayloadInput): string | null {
  const iban = input.iban.replace(/\s+/g, "").toUpperCase();
  const beneficiary = epcText(input.beneficiary, 70);
  if (!beneficiary || !isValidIban(iban)) return null;

  const bic = (input.bic ?? "").replace(/\s+/g, "").toUpperCase();
  const amountCents = Math.max(0, Math.round(input.amountCents));
  // EPC only accepts 0.01 – 999999999.99.
  if (amountCents > 0 && amountCents < 1) return null;

  const lines = [
    "BCD", // 1 service tag
    "002", // 2 version — BIC optional
    "1", // 3 character set: UTF-8
    "SCT", // 4 SEPA Credit Transfer
    bic, // 5 BIC (optional in 002)
    beneficiary, // 6 beneficiary name
    iban, // 7 beneficiary IBAN
    amountCents > 0 ? epcAmount(amountCents) : "", // 8 amount
    epcText(input.purpose ?? "", 4), // 9 purpose code
    "", // 10 structured creditor reference (RF) — unused
    epcText(input.reference, 140), // 11 unstructured remittance information
  ];

  // Trailing empty fields must be omitted, never sent as empty lines: strict
  // parsers (Keytrade, several PSD2 aggregators) reject the extra separator.
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  const payload = lines.join("\n");
  if (new TextEncoder().encode(payload).length > MAX_BYTES) return null;
  return payload;
}

/** One-shot clipboard text for mobile users pasting into their banking app. */
export function sepaClipboardText(input: {
  beneficiary: string;
  iban: string;
  bic?: string;
  amountCents: number;
  reference: string;
}): string {
  const amount = (Math.max(0, Math.round(input.amountCents)) / 100).toFixed(2).replace(".", ",");
  return [
    `Beneficiary: ${input.beneficiary}`,
    `IBAN: ${input.iban.replace(/\s+/g, "")}`,
    input.bic ? `BIC: ${input.bic}` : null,
    `Amount: EUR ${amount}`,
    `Reference: ${input.reference}`,
  ]
    .filter(Boolean)
    .join("\n");
}
