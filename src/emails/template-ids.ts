/**
 * Definitive Brevo template mapping — verified against the live Brevo account
 * (GET /v3/smtp/templates) on 2026-08-28.
 *
 * The old scheme *computed* IDs as `category base + language offset`. Brevo
 * does not actually number its templates that way: the auth block starts at
 * #13 (EN) because #12 is a system/admin template, and several blocks only
 * have NL/EN/FR/DE variants. Computing IDs therefore routed Dutch auth mails
 * to the admin-notification template — the reason login mails stopped
 * arriving. The mapping below is an explicit, verified table.
 *
 * Live blocks:
 *   1        System / admin notification
 *   11       Admin fallback alert
 *   13-20    Auth (EN, FR, DE, ES, IT, PT, PL, ZH) + 93 = NL, 21 = fallback
 *   22-30    Contact form confirmation + 31 fallback
 *   32-40    Billing — payment confirmation + 41 fallback
 *   42-50    Billing — payment problem + 51 fallback
 *   52-60    Billing — subscription renewal + 61 fallback
 *   62-70    Billing — payment succeeded & invoice + 71 fallback
 *   72-80    Billing — subscription cancellation + 81 fallback
 *   82-90    Billing — refund & credit note + 91 fallback, 92 extra copy

 *
 * Categories with no template in Brevo resolve to 0, which makes `sendMail`
 * skip straight to its inline HTML body instead of hitting a dead ID.
 */

export const EMAIL_LANGUAGES = ["nl", "en", "fr", "de", "es", "it", "pt", "pl", "zh"] as const;
export type EmailLanguage = (typeof EMAIL_LANGUAGES)[number];

/** Kept for documentation/back-compat: position of a language inside a block. */
export const LANGUAGE_OFFSET: Record<EmailLanguage, number> = {
  nl: 0,
  en: 1,
  fr: 2,
  de: 3,
  es: 4,
  it: 5,
  pt: 6,
  pl: 7,
  zh: 8,
};
export const CATEGORY_FALLBACK_OFFSET = 9;

/** Admin alert template used when a customer mail had to fall back. */
export const ADMIN_ALERT_TEMPLATE_ID = 11;
/** Absolute customer reserve when a category fallback is missing too. */
export const GLOBAL_FALLBACK_TEMPLATE_ID = 21;

/** Base IDs per logical category (first template of the block in Brevo). */
export const EMAIL_CATEGORY_BASE = {
  system: 1,
  login: 93,
  recovery: 93,
  email_change: 93,
  invite: 93,
  reauthentication: 93,
  confirmation: 93,
  deletion: 93,
  form: 22,
  payment_confirmation: 32,
  payment_issue: 42,
  renewal: 52,
  payment: 62,
  cancellation: 72,
  refund: 82,
  subdomain_claim: 2,
  transfer: 0,
  security: 0,
  merge: 0,
  welcome: 0,
  provisioning: 0,
  node_expiry: 0,
} as const;

export type EmailCategory = keyof typeof EMAIL_CATEGORY_BASE;

type LangMap = Partial<Record<EmailLanguage, number>>;

/** Every auth-style mail shares one localized block in Brevo. */
const AUTH_BLOCK: LangMap = {
  nl: 93,
  en: 13,
  fr: 14,
  de: 15,
  es: 16,
  it: 17,
  pt: 18,
  pl: 19,
  zh: 20,
};

function block(base: number, languages: readonly EmailLanguage[]): LangMap {
  const map: LangMap = {};
  languages.forEach((lang, index) => {
    map[lang] = base + index;
  });
  return map;
}

const NINE = EMAIL_LANGUAGES;

/** Verified Brevo template ID per category × language. */
export const EMAIL_TEMPLATE_IDS: Record<EmailCategory, LangMap> = {
  system: block(1, ["nl"]),
  login: AUTH_BLOCK,
  recovery: AUTH_BLOCK,
  email_change: AUTH_BLOCK,
  invite: AUTH_BLOCK,
  reauthentication: AUTH_BLOCK,
  confirmation: AUTH_BLOCK,
  deletion: AUTH_BLOCK,
  form: block(22, NINE),
  payment_confirmation: block(32, NINE),
  payment_issue: block(42, NINE),
  renewal: block(52, NINE),
  payment: block(62, NINE),
  cancellation: block(72, NINE),
  refund: block(82, NINE),
  subdomain_claim: { nl: 2 },
  transfer: {},
  security: {},
  merge: {},
  welcome: {},
  provisioning: {},
  node_expiry: {},
};

/** Extra kopie van de creditnota/terugbetaling (Brevo #92). */
export const CREDIT_NOTE_EXTRA_COPY_TEMPLATE_ID = 92;

/** Category-level fallback template that exists in Brevo (0 = none). */
export const EMAIL_CATEGORY_FALLBACK: Record<EmailCategory, number> = {
  system: 11,
  login: 21,
  recovery: 21,
  email_change: 21,
  invite: 21,
  reauthentication: 21,
  confirmation: 21,
  deletion: 21,
  form: 31,
  payment_confirmation: 41,
  payment_issue: 51,
  renewal: 61,
  payment: 71,
  cancellation: 81,
  refund: 91,
  subdomain_claim: 0,
  transfer: 0,
  security: 0,
  merge: 0,
  welcome: 0,
  provisioning: 0,
  node_expiry: 0,
};

/** Env override name suffix per category (BREVO_TEMPLATE_<KEY>[_<LANG>]). */
function categoryKey(category: EmailCategory): string {
  return category.toUpperCase();
}

/** Normalises anything user- or database-supplied to a supported language. */
export function asEmailLanguage(value: unknown): EmailLanguage {
  const raw = String(value ?? "")
    .toLowerCase()
    .slice(0, 5)
    .replace("_", "-");
  const short = raw.split("-")[0] ?? "";
  return (EMAIL_LANGUAGES as readonly string[]).includes(short) ? (short as EmailLanguage) : "en";
}

function envOverride(name: string): number | null {
  const raw = process.env[name];
  if (!raw || raw.trim().length === 0) return null;
  const id = Number(raw.trim());
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** Category fallback template, overridable per category. 0 = none in Brevo. */
export function reserveTemplateId(category: EmailCategory): number {
  return (
    envOverride(`BREVO_TEMPLATE_${categoryKey(category)}_FALLBACK`) ??
    EMAIL_CATEGORY_FALLBACK[category]
  );
}

/** Admin alert template (#11 by default). */
export function adminAlertTemplateId(): number {
  return envOverride("BREVO_TEMPLATE_ADMIN_ALERT") ?? ADMIN_ALERT_TEMPLATE_ID;
}

/** Global customer reserve template (#21 by default). */
export function globalFallbackTemplateId(): number {
  return envOverride("BREVO_TEMPLATE_GLOBAL_FALLBACK") ?? GLOBAL_FALLBACK_TEMPLATE_ID;
}

/**
 * Template ID for one category + language, read from the verified table.
 * Env overrides (`BREVO_TEMPLATE_LOGIN_NL`, then `BREVO_TEMPLATE_LOGIN`) win
 * when a Brevo account numbers a template differently. Falls back to the
 * category's English variant, then Dutch, then its category fallback, then 0.
 */
export function brevoTemplateId(category: EmailCategory, language: unknown): number {
  const lang = asEmailLanguage(language);
  const key = categoryKey(category);
  const table = EMAIL_TEMPLATE_IDS[category];
  return (
    envOverride(`BREVO_TEMPLATE_${key}_${lang.toUpperCase()}`) ??
    envOverride(`BREVO_TEMPLATE_${key}`) ??
    table[lang] ??
    table.en ??
    table.nl ??
    EMAIL_CATEGORY_FALLBACK[category]
  );
}
