/**
 * Generator voor gratis handles (`rout.be/u/<handle>`).
 *
 * Een gratis handle telt minstens 5 tekens, 3 letters en 2 cijfers. Kiest een
 * nieuw lid bij registratie zelf geen naam, dan krijgt het er automatisch een
 * die aan die regel voldoet en willekeurig genoeg is om niet te botsen.
 *
 * Client-safe: geen server-only imports.
 */

import { normalizeHandleForStorage } from "./handle-rules";
import { strictHandleIssue } from "./handle-validation";
import { isReservedSlug } from "./reserved-slugs";

/** Letters van een basiswoord (naam, e-mailprefix) overhouden. */
function lettersOf(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

const FALLBACK_WORDS = [
  "route",
  "kompas",
  "baken",
  "anker",
  "zenit",
  "kiezel",
  "vonk",
  "orbit",
  "atlas",
  "peiler",
];

function randomDigits(count: number): string {
  let out = "";
  for (let i = 0; i < count; i += 1) out += String(Math.floor(Math.random() * 10));
  return out;
}

/**
 * Bouwt één kandidaat: een leesbaar woord + vier cijfers, bv. `jona4827`.
 * `seed` mag een voornaam, weergavenaam of e-mailprefix zijn.
 */
export function randomFreeHandle(seed?: string | null): string {
  const base = lettersOf(String(seed ?? "")).slice(0, 12);
  const word =
    base.length >= 3
      ? base
      : (FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)] as string);
  return normalizeHandleForStorage(`${word}${randomDigits(4)}`);
}

/** Voldoet deze handle aan de gratis-aliasregel en is hij niet gereserveerd? */
export function isUsableFreeHandle(handle: string): boolean {
  const clean = normalizeHandleForStorage(handle);
  if (!clean) return false;
  if (isReservedSlug(clean)) return false;
  return strictHandleIssue(clean, { alias: true }) === null;
}

/**
 * Levert kandidaten in volgorde: eerst de gewenste naam, daarna willekeurige
 * varianten. De server neemt de eerste die nog vrij is.
 */
export function freeHandleCandidates(
  preferred: string | null | undefined,
  seed: string | null | undefined,
  count = 12,
): string[] {
  const out: string[] = [];
  const push = (value: string) => {
    if (isUsableFreeHandle(value) && !out.includes(value)) out.push(value);
  };

  if (preferred) push(normalizeHandleForStorage(preferred));
  // Een gekozen naam zonder cijfers wordt alsnog bruikbaar met een suffix.
  if (preferred) push(normalizeHandleForStorage(`${lettersOf(preferred)}${randomDigits(2)}`));

  while (out.length < count) {
    const candidate = randomFreeHandle(seed);
    if (isUsableFreeHandle(candidate) && !out.includes(candidate)) out.push(candidate);
  }
  return out;
}
