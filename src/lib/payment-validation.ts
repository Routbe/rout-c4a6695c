/**
 * Landspecifieke validatie van bankgegevens en betaalsleutels.
 *
 * Wordt zowel client- als serverzijde gebruikt: we tonen nooit een QR of
 * betaalinstructie met gegevens die de bank van de betaler zou weigeren.
 */
import { isValidIban } from "./epc-qr";

export { isValidIban };

/** US ABA routing number: 9 cijfers met checksum (mod 10, gewicht 3-7-1). */
export function isValidRoutingNumber(raw: string): boolean {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length !== 9 || /^0+$/.test(digits)) return false;
  const weights = [3, 7, 1, 3, 7, 1, 3, 7, 1];
  const sum = digits.split("").reduce((acc, d, i) => acc + Number(d) * (weights[i] as number), 0);
  return sum % 10 === 0;
}

/** UK sort code: 6 cijfers, met of zonder streepjes. */
export function isValidSortCode(raw: string): boolean {
  return /^\d{6}$/.test((raw ?? "").replace(/[\s-]/g, ""));
}

/** Generiek rekeningnummer: 4–20 alfanumerieke tekens. */
export function isValidAccountNumber(raw: string): boolean {
  return /^[A-Za-z0-9]{4,20}$/.test((raw ?? "").replace(/[\s-]/g, ""));
}

/** Pix-sleutel: e-mail, telefoon (+55…), CPF/CNPJ of EVP-UUID. */
export function isValidPixKey(raw: string): boolean {
  const key = (raw ?? "").trim();
  if (!key || key.length > 77) return false;
  if (/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(key)) return true;
  if (/^\+55\d{10,11}$/.test(key)) return true;
  if (/^\d{11}$/.test(key) || /^\d{14}$/.test(key)) return true;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
}

/** UPI VPA: `naam@bank`, geen spaties, bank-handle van minstens 2 tekens. */
export function isValidUpiVpa(raw: string): boolean {
  return /^[A-Za-z0-9.\-_]{2,64}@[A-Za-z]{2,32}$/.test((raw ?? "").trim());
}

/** Heeft dit land/valuta-paar bruikbare gegevens om mee af te rekenen? */
export function hasUsablePaymentDetails(input: {
  currency: string;
  iban?: string | null;
  accountNumber?: string | null;
  routingNumber?: string | null;
  sortCode?: string | null;
  pixKey?: string | null;
  upiVpa?: string | null;
}): boolean {
  const currency = (input.currency || "").toUpperCase();
  if (currency === "BRL" && input.pixKey) return isValidPixKey(input.pixKey);
  if (currency === "INR" && input.upiVpa) return isValidUpiVpa(input.upiVpa);
  if (input.iban) return isValidIban(input.iban);
  if (input.accountNumber && isValidAccountNumber(input.accountNumber)) {
    if (currency === "USD") return isValidRoutingNumber(input.routingNumber ?? "");
    if (currency === "GBP") return isValidSortCode(input.sortCode ?? "");
    return true;
  }
  return false;
}
