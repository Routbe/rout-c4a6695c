/**
 * Local privacy bot for text printed on the ROUT Card. Runs in the browser and
 * again on the server before saving; nothing is sent elsewhere. A lost card
 * must never carry contact details or identity numbers.
 */
export type PrivacyHit = "email" | "phone" | "national-id" | "passport" | "birth-date" | "iban" | "url" | "length";

const RULES: [PrivacyHit, RegExp][] = [
  ["email", /[^\s@]+\s*(@|\(at\)|\[at\])\s*[^\s@]+\.[a-z]{2,}/i],
  // Belgian national register number: YY.MM.DD-XXX.CC or 11 digits.
  ["national-id", /\b\d{2}[.\s]?\d{2}[.\s]?\d{2}[-\s]?\d{3}[.\s]?\d{2}\b/],
  ["iban", /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}\b/i],
  // +32 4.., 0032.., 04xx.., 06.. with optional separators: 8+ digits overall.
  ["phone", /(?:\+|00)\d[\d\s().-]{7,}\d|\b0\d(?:[\s./-]?\d){7,}\b/],
  ["birth-date", /\b(0?[1-9]|[12]\d|3[01])[/.-](0?[1-9]|1[0-2])[/.-](19|20)?\d{2}\b|\b(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/],
  // Passport style: 1-2 letters followed by 6-8 digits (EU passports).
  ["passport", /\b[A-Z]{1,2}\d{6,8}\b/i],
  ["url", /\bhttps?:\/\/|\bwww\./i],
];

export const PRIVACY_MESSAGE =
  "Privacy-by-Design Interventie: Om identiteitsfraude bij fysiek verlies te voorkomen, staat ROUT geen gevoelige contact- of persoonsgegevens toe op de kaart-layout. Gebruik hiervoor je digitale profiel.";

export function checkCardText(text: string, max = 40): PrivacyHit | null {
  if (text.length > max) return "length";
  const t = text.normalize("NFKC");
  for (const [hit, re] of RULES) if (re.test(t)) return hit;
  return null;
}
