/**
 * Locale-aware date and currency formatting for the four ROUT languages.
 *
 * Kept separate from `i18n.tsx` so server code and plain helpers can format
 * without pulling in React context.
 */

import type { Locale } from "./i18n";

/** BCP-47 tags: Dutch defaults to Flemish, matching the Belgian audience. */
const BCP47: Record<Locale, string> = {
  nl: "nl-BE",
  en: "en-GB",
  fr: "fr-BE",
  de: "de-DE",
};

export function intlLocale(locale: Locale | string | undefined): string {
  return BCP47[(locale ?? "nl") as Locale] ?? "en-GB";
}

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 8 aug 2026 */
export function formatDate(
  value: string | number | Date | null | undefined,
  locale: Locale | string,
): string {
  const date = toDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** 8 aug 2026, 14:05 */
export function formatDateTime(
  value: string | number | Date | null | undefined,
  locale: Locale | string,
): string {
  const date = toDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Euro amounts are stored in cents everywhere in ROUT. */
export function formatCurrency(cents: number, locale: Locale | string, currency = "EUR"): string {
  const amount = (Number.isFinite(cents) ? cents : 0) / 100;
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export function formatNumber(value: number, locale: Locale | string): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(Number.isFinite(value) ? value : 0);
}
