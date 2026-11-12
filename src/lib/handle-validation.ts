/**
 * Strikte handle-validatie, gedeeld door onboarding, Studio en het adminportaal.
 * Client-safe: geen server-only imports.
 *
 * De regels hier zijn de harde ondergrens ("mag deze handle überhaupt
 * bestaan?"). Tier-regels (gratis vs. geverifieerd) blijven in `handle-rules`.
 */

import { normalizeHandleForStorage } from "./handle-rules";
import { sanitizeHandleInput } from "@/lib/validations/sanitizeHandle";
import { isReservedSlug } from "./reserved-slugs";

/** Extra systeemwoorden bovenop de routelijst. */
const EXTRA_RESERVED = new Set(["u", "rout", "routbe", "studio", "settings", "api", "admin"]);

export const STRICT_HANDLE_MIN = 3;
export const STRICT_HANDLE_MAX = 30;

/** Aliassen (`/u/<handle>`) moeten minstens zoveel cijfers dragen. */
export const ALIAS_MIN_DIGITS = 2;

/** Aliassen zijn minstens zo lang — korter is te raadbaar. */
export const ALIAS_MIN_LENGTH = 5;

/** …en dragen altijd minstens drie letters (cijfers zijn onbeperkt). */
export const ALIAS_MIN_LETTERS = 3;

export const MSG_CHARSET =
  "❗ Deze gebruikersnaam bevat niet-toegestane tekens (gebruik enkel kleine letters, cijfers, . _ -)";
export const MSG_LENGTH = "❗ Een gebruikersnaam telt tussen 3 en 30 tekens.";
export const MSG_REPEAT = "❗ Twee opeenvolgende leestekens (.., -- of __) zijn niet toegestaan.";
export const MSG_EDGES = "❗ Een gebruikersnaam begint en eindigt met een letter of cijfer.";
export const MSG_RESERVED =
  "❗ Deze naam is een gereserveerd systeemwoord en kan niet geclaimd worden.";
export const MSG_ALIAS_DIGITS =
  "❗ Een privacy-alias moet minstens 5 tekens, 3 letters en 2 cijfers bevatten (bijv. jona50). Meer cijfers mag.";

/** Vriendelijkere variant voor het aliasformulier zelf. */
export const ALIAS_DIGITS_HINT = MSG_ALIAS_DIGITS;

export interface StrictHandleOptions {
  /** Privacy-alias op `/u/` — vereist minstens 2 cijfers. */
  alias?: boolean;
}

/** Kleine letters, cijfers, punt, underscore en koppelteken. */
export const STRICT_HANDLE_PATTERN = /^[a-z0-9._-]+$/;

/**
 * Retourneert een leesbare foutmelding (met rood uitroepteken) of `null` als de
 * handle geldig is. Een lege invoer geeft `null`: dan is er nog niets te melden.
 */
export function strictHandleIssue(raw: string, options: StrictHandleOptions = {}): string | null {
  const handle = sanitizeHandleInput(raw);
  if (!handle) return null;

  if (!STRICT_HANDLE_PATTERN.test(handle)) return MSG_CHARSET;
  if (handle.length < STRICT_HANDLE_MIN || handle.length > STRICT_HANDLE_MAX) return MSG_LENGTH;
  if (/(\.\.|--|__)/.test(handle)) return MSG_REPEAT;
  if (/^[._-]|[._-]$/.test(handle)) return MSG_EDGES;
  if (isReservedSlug(handle) || EXTRA_RESERVED.has(handle)) return MSG_RESERVED;
  if (
    options.alias &&
    (handle.length < ALIAS_MIN_LENGTH ||
      (handle.match(/[0-9]/g) ?? []).length < ALIAS_MIN_DIGITS ||
      (handle.match(/[a-z]/g) ?? []).length < ALIAS_MIN_LETTERS)
  ) {
    return MSG_ALIAS_DIGITS;
  }
  return null;
}

/** True wanneer de handle door de strikte regels raakt. */
export function isStrictHandleValid(raw: string, options: StrictHandleOptions = {}): boolean {
  const handle = sanitizeHandleInput(raw);
  return handle.length > 0 && strictHandleIssue(handle, options) === null;
}

/** Canonieke opslagvorm — herexporteerd zodat formulieren één import hebben. */
export const normalizeStrictHandle = normalizeHandleForStorage;
