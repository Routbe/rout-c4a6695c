/**
 * Brevo template grid — één bron van waarheid voor de template-ID's.
 *
 * Het rooster werkt per blok van tien, waarbij het laatste cijfer de taal
 * bepaalt: ...2 = NL, ...3 = EN, ...4 = FR, ...5 = DE, ...6 = ES, ...7 = IT,
 * ...8 = PT, ...9 = PL, ...0 = ZH, ...1 = fallback.
 *
 * Uitzonderingen die echt zo in het Brevo-account staan:
 *  - Auth Magic Link NL is #93 (ID 12 was al bezet door de admin-notificatie).
 *  - De blokken factuur (#62), annulering (#72) en terugbetaling (#82) hebben
 *    voorlopig enkel NL/EN/FR/DE; de rest valt terug op EN.
 *  - Categorieën zonder template in Brevo staan op 0 → de mailer stuurt dan
 *    onze eigen inline HTML in plaats van een dood template-ID aan te spreken.
 */

export type SupportedLanguage = "nl" | "en" | "fr" | "de" | "es" | "it" | "pt" | "pl" | "zh";

export const BREVO_MAP = {
  // System & Admin Alerts
  SYSTEM_ADMIN_NOTIFY: { default: 1, root_claim: 2, custom: 10, fallback: 11 },

  // Auth: Magic Link (NL #93, EN #13 – ZH #20)
  AUTH_MAGIC_LINK: {
    nl: 93,
    en: 13,
    fr: 14,
    de: 15,
    es: 16,
    it: 17,
    pt: 18,
    pl: 19,
    zh: 20,
    fallback: 21,
  },

  // Contact: bevestiging naar de bezoeker (#22 – #31)
  CONTACT_CONFIRMATION: { nl: 22, en: 23, fr: 24, de: 25, fallback: 23 },

  // Billing: betaalbevestiging (#32 – #41)
  BILLING_PAYMENT_SUCCESS: { nl: 32, en: 33, fr: 34, de: 35, fallback: 33 },

  // Billing: mislukte betaling / dunning (#42 – #51)
  BILLING_PAYMENT_FAILED: { nl: 42, en: 43, fr: 44, de: 45, fallback: 43 },

  // Billing: verlenging abonnement (#52 – #61)
  BILLING_SUBSCRIPTION_RENEWAL: {
    nl: 52,
    en: 53,
    fr: 54,
    de: 55,
    es: 56,
    it: 57,
    pt: 58,
    pl: 59,
    zh: 60,
    fallback: 61,
  },

  // Billing: factuur & geslaagde betaling (#62 – #71, enkel NL/EN/FR/DE gebouwd)
  BILLING_INVOICE: { nl: 62, en: 63, fr: 64, de: 65, fallback: 63 },

  // Billing: abonnement geannuleerd (#72 – #81, enkel NL/EN/FR/DE gebouwd)
  BILLING_CANCELLED: { nl: 72, en: 73, fr: 74, de: 75, fallback: 73 },

  // Billing: terugbetaling & creditnota (#82 – #91, enkel NL/EN/FR/DE gebouwd)
  BILLING_REFUND: { nl: 82, en: 83, fr: 84, de: 85, fallback: 83 },

  // ── Nog te bouwen in Brevo (0 = inline HTML uit de codebase) ───────────────
  VERIFICATION_APPROVED: { fallback: 0 },
  VERIFICATION_REJECTED: { fallback: 0 },
  ALIAS_LINKED: { fallback: 0 },
  BOOKING_HOST_REQUEST: { fallback: 0 },
  BOOKING_GUEST_CONFIRMED: { fallback: 0 },
  BOOKING_GUEST_DECLINED: { fallback: 0 },
  LEAD_WELCOME: { fallback: 0 },
  DONATION_RECEIPT: { fallback: 0 },
} as const;

export type BrevoCategory = keyof typeof BREVO_MAP;

/** Categorieën waarvoor er nog geen taalblok in Brevo bestaat. */
export const MISSING_BREVO_BLOCKS: BrevoCategory[] = [
  "VERIFICATION_APPROVED",
  "VERIFICATION_REJECTED",
  "ALIAS_LINKED",
  "BOOKING_HOST_REQUEST",
  "BOOKING_GUEST_CONFIRMED",
  "BOOKING_GUEST_DECLINED",
  "LEAD_WELCOME",
  "DONATION_RECEIPT",
];

/**
 * Zoekt het juiste template-ID voor één categorie + taal.
 * Geeft 0 terug wanneer het blok nog niet in Brevo bestaat.
 */
export function resolveBrevoTemplate(category: BrevoCategory, lang?: string | null): number {
  const cleanLang = (lang?.toLowerCase().slice(0, 2) || "nl") as SupportedLanguage;
  const categoryMap = BREVO_MAP[category] as Record<string, number | undefined>;
  return (
    categoryMap[cleanLang] ??
    categoryMap["fallback"] ??
    categoryMap["nl"] ??
    categoryMap["default"] ??
    0
  );
}
