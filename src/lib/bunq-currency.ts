/**
 * Land-, valuta- en SEPA-routing voor de ROUT-checkout.
 *
 * Isomorf: client en server gebruiken exact dezelfde mapping. De valuta komt
 * uit de wereldwijde ISO-tabel (`countries.ts`); daarnaast weten we welke
 * landen binnen de SEPA-zone vallen. Voor SEPA-landen is een EUR-overschrijving
 * altijd geldig — desnoods op de centrale EUR-hoofdrekening.
 */

import { findCountry } from "./countries";

export interface CurrencyRoute {
  /** ISO 4217-valuta van het gekozen land. */
  currency: string;
  /** `true` wanneer het land binnen de SEPA-zone valt (EUR-overschrijving OK). */
  direct: boolean;
}

/**
 * SEPA-zone (EU + EER + CH/UK/MC/SM/VA/AD + Balkan-toetreders). Deze landen
 * kunnen altijd een EUR-overschrijving doen, ook als hun eigen valuta anders is.
 */
export const SEPA_COUNTRIES = new Set([
  "AT",
  "BE",
  "BG",
  "CH",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "GB",
  "GR",
  "HR",
  "HU",
  "IE",
  "IS",
  "IT",
  "LI",
  "LT",
  "LU",
  "LV",
  "MC",
  "MT",
  "NL",
  "NO",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
  "SM",
  "VA",
  "AD",
  "AL",
  "MD",
  "ME",
  "MK",
  "RS",
  // Franse/Spaanse/Portugese gebieden binnen SEPA.
  "GF",
  "GP",
  "MQ",
  "RE",
  "YT",
  "BL",
  "MF",
  "PM",
  "AX",
  "GI",
  "JE",
  "GG",
  "IM",
]);

/** Valt dit land binnen de SEPA-zone? */
export function isSepaCountry(country: string): boolean {
  return SEPA_COUNTRIES.has((country ?? "").toUpperCase());
}

/** Valuta van een landcode (default EUR, ook voor onbekende codes). */
export function currencyForCountry(country: string): string {
  const iso = (country ?? "").toUpperCase();
  if (!iso || iso === "OTHER") return "EUR";
  return findCountry(iso)?.currency ?? "EUR";
}

/** Bepaal valuta en directe SEPA-ondersteuning voor een landcode. */
export function routeCountry(country: string): CurrencyRoute {
  const currency = currencyForCountry(country);
  return { currency, direct: currency === "EUR" || isSepaCountry(country) };
}
