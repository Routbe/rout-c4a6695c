/**
 * Verified-handle generation.
 *
 * Verified members never type a free-text handle: they pick from a generated
 * list built out of their real name. Every option contains at least one FULL
 * name part (full first name or full last name), combined with the initial of
 * another name part or with a middle name, using flexible separators.
 *
 * Client-safe: no server-only imports.
 */

import { normalizeHandleInput } from "./handle-rules";

export const HANDLE_SEPARATORS = [".", "-", "_"] as const;
export type HandleSeparator = (typeof HANDLE_SEPARATORS)[number];

/** Strip accents, keep a–z0–9 only. */
function slug(part: string): string {
  return part
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function nameParts(fullName: string): string[] {
  return fullName
    .split(/[\s]+/)
    .map(slug)
    .filter((p) => p.length > 0);
}

/**
 * Generates unique, valid handle candidates for a verified member.
 * Ordered from most natural (full first + full last) to more compact variants.
 */
export function generateHandleOptions(fullName: string, limit = 12): string[] {
  const parts = nameParts(fullName);
  if (parts.length === 0) return [];

  const first = parts[0]!;
  const last = parts.length > 1 ? parts[parts.length - 1]! : undefined;
  const middles = parts.slice(1, Math.max(1, parts.length - 1));

  /** [fullPart, otherPart] pairs — the full part always comes from a real name. */
  const pairs: Array<[string, string]> = [];
  if (last) {
    pairs.push([first, last]); // jona.delplanche
    pairs.push([first, last[0]!]); // jona.d
    pairs.push([last, first[0]!]); // delplanche.j
    pairs.push([first[0]!, last]); // j.delplanche
    for (const m of middles) {
      pairs.push([first, m]); // jona.pieter
      pairs.push([first, m[0]!]); // jona.p
      pairs.push([m, last]); // pieter.delplanche
    }
  }

  const out: string[] = [];
  const push = (candidate: string) => {
    const clean = normalizeHandleInput(candidate);
    if (clean.length < 5) return; // 3–4 stays VIP-reserved, even for verified members
    if (clean.length > 30) return;
    if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(clean)) return;
    if (out.includes(clean)) return;
    out.push(clean);
  };

  // Separator-major ordering keeps a readable dotted list first.
  for (const sep of HANDLE_SEPARATORS) {
    for (const [a, b] of pairs) push(`${a}${sep}${b}`);
  }
  // Glued variants (no separator) as a last resort.
  for (const [a, b] of pairs) push(`${a}${b}`);
  // Single full name, only when nothing combined survived the rules.
  if (out.length === 0) {
    push(first);
    if (last) push(last);
  }

  return out.slice(0, limit);
}

/**
 * Free (unverified) members may append 2 or 3 digits to distinguish their
 * handle. Used to build fallback suggestions when a handle is taken.
 */
export function withDigitSuffixes(handle: string, count = 3): string[] {
  const base = normalizeHandleInput(handle);
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const digits = String(Math.floor(10 + Math.random() * 990)); // 2–3 digits
    const candidate = `${base}${digits}`.slice(0, 30);
    if (!out.includes(candidate)) out.push(candidate);
  }
  return out;
}

/**
 * Free members may append as many digits as they like — de enige eis is dat er
 * minstens drie letters overblijven, zodat `jona12345` mag en `j1234` niet.
 */
export function hasValidDigitSuffix(handle: string): boolean {
  const clean = normalizeHandleInput(handle);
  if (!/\d/.test(clean)) return true;
  return (clean.match(/[a-z]/g) ?? []).length >= 3;
}

/**
 * Widened generation used when the base option set collides too much: adds
 * more separator/variant combinations, and — only as a last resort — a
 * 2–3 digit discriminator suffix on the earlier candidates. Still every base
 * candidate keeps at least one full name part; digits are only ever appended,
 * never used to replace a name part.
 */
export function generateWidenedHandleOptions(fullName: string, limit = 40): string[] {
  const parts = nameParts(fullName);
  if (parts.length === 0) return [];

  const base = generateHandleOptions(fullName, limit);
  const out = [...base];
  const seen = new Set(out);

  const first = parts[0]!;
  const last = parts.length > 1 ? parts[parts.length - 1]! : undefined;
  const middles = parts.slice(1, Math.max(1, parts.length - 1));

  // Extra separator-major combinations beyond the "natural" ordering.
  const extraPairs: Array<[string, string]> = [];
  if (last) {
    extraPairs.push([last, first]); // delplanche.jona
    extraPairs.push([first[0]!, last[0]!]);
    for (const m of middles) {
      extraPairs.push([m, first]);
      extraPairs.push([last, m]);
    }
  }
  const push = (candidate: string) => {
    const clean = normalizeHandleInput(candidate);
    if (clean.length < 5 || clean.length > 30) return;
    if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(clean)) return;
    if (seen.has(clean)) return;
    seen.add(clean);
    out.push(clean);
  };
  for (const sep of HANDLE_SEPARATORS) {
    for (const [a, b] of extraPairs) push(`${a}${sep}${b}`);
  }
  for (const [a, b] of extraPairs) push(`${a}${b}`);

  // Last resort: append a 2–3 digit discriminator to the strongest base
  // candidates so we can still offer unique options once names collide.
  if (out.length < limit) {
    for (const b of base) {
      for (const digits of ["1", "2", "3", "01", "02", "10", "11", "22", "99"]) {
        push(`${b}${digits}`);
        if (out.length >= limit) break;
      }
      if (out.length >= limit) break;
    }
  }

  return out.slice(0, limit);
}
