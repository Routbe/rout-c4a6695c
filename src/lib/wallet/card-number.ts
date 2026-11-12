/**
 * ROUT card numbers: RT-XXXX-XXXX-C. The 8 body characters come from a keyed
 * HMAC digest (never a counter, never Math.random), so numbers cannot be
 * enumerated. C is a weighted mod-31 check character over the body: it catches
 * every single typo and every swap of two neighbours without a database lookup.
 */
/** Crockford base32 without Z: 31 symbols, so mod-31 (prime) weights all work. */
export const CARD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXY";
const BODY_LEN = 8;
const FORMAT = /^RT-([0-9A-HJKMNP-TV-Y]{4})-([0-9A-HJKMNP-TV-Y]{4})-([0-9A-HJKMNP-TV-Y])$/;

export function cardCheckChar(body: string): string {
  if (body.length !== BODY_LEN) throw new Error("card body must be 8 characters");
  let sum = 0;
  for (let i = 0; i < BODY_LEN; i++) {
    const v = CARD_ALPHABET.indexOf(body[i]!);
    if (v < 0) throw new Error("invalid card character");
    sum += (i + 1) * v;
  }
  return CARD_ALPHABET[sum % 31]!;
}

/** Card number from a keyed hex digest (at least 16 hex chars). */
export function cardNumberFromDigest(hex: string): string {
  const h = hex.replace(/[^0-9a-f]/gi, "");
  if (h.length < BODY_LEN * 2) throw new Error("digest too short");
  let body = "";
  for (let i = 0; i < BODY_LEN; i++) body += CARD_ALPHABET[parseInt(h.slice(i * 2, i * 2 + 2), 16) % 31];
  return `RT-${body.slice(0, 4)}-${body.slice(4)}-${cardCheckChar(body)}`;
}

/** Normalises what people type (o→0, i/l→1, spaces) and checks the check character. */
export function normalizeCardNumber(input: string): string | null {
  const s = input.toUpperCase().replace(/\s+/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  const m = FORMAT.exec(s);
  if (!m) return null;
  return cardCheckChar(m[1]! + m[2]!) === m[3] ? s : null;
}

/** Body + check without dashes or prefix: the 9-character MRZ document number. */
export function cardDocumentNumber(cardNumber: string): string {
  return cardNumber.replace(/^RT-/, "").replace(/-/g, "").slice(0, 9);
}
