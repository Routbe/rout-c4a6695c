/**
 * Fuzzy name matching for inbound SEPA transfers (matcher level 2b).
 *
 * Banks hand us the payer name exactly as the account holder typed it at the
 * bank: initials instead of first names, a maiden name, a company account, a
 * missing accent, a swapped word order. A strict string compare would send all
 * of those to the "no match" bin, so we grade the similarity instead:
 *
 *   strong   — the same person beyond reasonable doubt (auto follow-up)
 *   partial  — probably the same person, a human confirms (level 2b review)
 *   weak     — nothing in common, do not touch the member's account
 *
 * Pure module: no database, no network — fully unit-testable.
 */

export type NameMatchVerdict = "strong" | "partial" | "weak";

export interface NameMatch {
  verdict: NameMatchVerdict;
  /** 0…1, rounded to two decimals. */
  score: number;
  normalizedPayer: string;
  normalizedHolder: string;
}

/** Above this the names are treated as the same person. */
export const STRONG_NAME_THRESHOLD = 0.85;
/** Between this and STRONG the transfer goes to admin review (level 2b). */
export const PARTIAL_NAME_THRESHOLD = 0.55;

/** Legal-form and courtesy noise that says nothing about identity. */
const NOISE = new Set([
  "de",
  "van",
  "der",
  "den",
  "het",
  "ter",
  "te",
  "la",
  "le",
  "du",
  "di",
  "mr",
  "mrs",
  "ms",
  "dhr",
  "mevr",
  "bv",
  "bvba",
  "nv",
  "sa",
  "srl",
  "sprl",
  "vzw",
  "asbl",
  "gmbh",
  "ltd",
  "llc",
  "inc",
]);

/**
 * Lower-cases, strips accents, punctuation and legal-form noise, and sorts the
 * remaining tokens so "Jansen, J." and "J Jansen" normalise to the same shape.
 */
export function normalizeName(value: string | null | undefined): string {
  if (!value) return "";
  const tokens = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0 && !NOISE.has(token));
  return tokens.sort().join(" ");
}

/**
 * Same normalisation, but keeps the noise words and glues everything together:
 * "Van den Berg", "van den berg" and "Vandenberg" all become "vandenberg".
 * Banks and members write compound surnames both ways, so this compact form
 * keeps a purely typographic difference out of the review queue.
 */
export function compactName(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Tokens of a normalised name. */
function tokensOf(value: string): string[] {
  return value.length === 0 ? [] : value.split(" ");
}

/** Classic Levenshtein distance, iterative and allocation-light. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (current[j - 1] ?? 0) + 1,
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

/** 1 − normalised edit distance, on the sorted-token forms. */
function editRatio(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 0;
  return 1 - levenshtein(a, b) / longest;
}

/**
 * Token overlap where an initial counts as its full word ("j" ≈ "jan"), so
 * "J. Jansen" still scores high against "Jan Jansen".
 */
function tokenRatio(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const pool = [...long];
  let hits = 0;
  for (const token of short) {
    const index = pool.findIndex(
      (candidate) =>
        candidate === token ||
        (token.length === 1 && candidate.startsWith(token)) ||
        (candidate.length === 1 && token.startsWith(candidate)) ||
        editRatio(candidate, token) >= 0.8,
    );
    if (index >= 0) {
      hits += 1;
      pool.splice(index, 1);
    }
  }
  return hits / short.length;
}

/**
 * Compares the payer name on the transfer with the account holder name.
 * Returns a verdict plus the score the admin review row shows.
 */
export function matchPayerName(
  payerName: string | null | undefined,
  holderName: string | null | undefined,
): NameMatch {
  const payer = normalizeName(payerName);
  const holder = normalizeName(holderName);

  if (payer.length === 0 || holder.length === 0) {
    return { verdict: "weak", score: 0, normalizedPayer: payer, normalizedHolder: holder };
  }
  if (payer === holder) {
    return { verdict: "strong", score: 1, normalizedPayer: payer, normalizedHolder: holder };
  }

  const payerTokens = tokensOf(payer);
  const holderTokens = tokensOf(holder);
  const overlap = tokenRatio(payerTokens, holderTokens);
  const edit = editRatio(payer, holder);
  // Token overlap survives reordering and extra middle names, so it leads —
  // but a name the other side does not carry at all (an extra surname, a
  // double-barrelled partner name) must cost something, hence the coverage
  // factor. The edit ratio keeps single-typo cases from dropping through.
  const coverage =
    Math.min(payerTokens.length, holderTokens.length) /
    Math.max(payerTokens.length, holderTokens.length);
  // Spacing-only differences ("Van den Berg" vs "Vandenberg") must not cost
  // anything: compare the glued forms as an extra candidate.
  const compact = editRatio(compactName(payerName), compactName(holderName));
  const raw = Math.max(overlap * (0.55 + 0.45 * coverage) * 0.85 + edit * 0.15, edit, compact);
  const score = Math.round(raw * 100) / 100;

  const verdict: NameMatchVerdict =
    score >= STRONG_NAME_THRESHOLD
      ? "strong"
      : score >= PARTIAL_NAME_THRESHOLD
        ? "partial"
        : "weak";

  return { verdict, score, normalizedPayer: payer, normalizedHolder: holder };
}

/** Labelled fields banks use for the counterparty on an inbound transfer. */
const NAME_LABELS =
  /(?:van|from|payer|counterparty|counter\s*party|opdrachtgever|naam(?:\s*rekeninghouder)?|account\s*holder|sender|absender|donneur\s*d['’]ordre|expéditeur|expediteur)\s*[:-]\s*([^\n\r;|]{2,80})/i;

/**
 * Best-effort payer name from a free-text bank notification. Returns `null`
 * when the text has no labelled name — the matcher then keeps the transfer on
 * the reference-only track instead of inventing a mismatch.
 */
export function extractPayerName(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = NAME_LABELS.exec(text);
  const raw = match?.[1]?.trim();
  if (!raw) return null;
  // Strip trailing artefacts: IBANs, amounts and references glued to the name.
  const cleaned = raw
    .replace(/\b[A-Z]{2}[0-9]{2}[A-Z0-9]{8,}\b/gi, " ")
    .replace(/\bROUT[\s-]*[A-Z0-9]{4,8}\b/gi, " ")
    .replace(/(?:EUR|€)\s*[0-9.,]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  // A usable name carries at least one alphabetic word of two characters.
  if (cleaned.length < 2 || !/[a-z]{2}/i.test(normalizeName(cleaned))) return null;
  return cleaned;
}
