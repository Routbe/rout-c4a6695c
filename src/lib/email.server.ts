/**
 * Centrale, meertalige e-maildienst voor auth-mails (Brevo-templates).
 *
 * - Geen database: template-ID's komen uit een statische tabel in het geheugen,
 *   afgeleid van de geverifieerde Brevo-mapping in `src/emails/template-ids.ts`.
 * - Nooit gooien: een Brevo-storing mag de login nooit breken.
 * - Niet-blokkerend: op Vercel via `waitUntil`, anders begrensd afwachten.
 *
 * Wisselen naar code-templates (React Email) = alleen dit bestand aanpassen
 * (de rest van de app roept enkel `sendLocalizedEmail` aan).
 */
import { EMAIL_TEMPLATE_IDS, GLOBAL_FALLBACK_TEMPLATE_ID, type EmailCategory } from "@/emails/template-ids";
import { registerBackgroundTask } from "./background-task.server";

export const EMAIL_LOCALES = ["nl", "en", "fr", "de", "es", "it", "pt", "pl", "zh"] as const;
export type EmailLocale = (typeof EMAIL_LOCALES)[number];

export const EMAIL_INTENTS = [
  "magic-link",
  "verification",
  "password-reset",
  "email-change",
  "welcome",
  "workspace-owner-invite",
  "workspace-member-onboarding",
] as const;
export type EmailIntent = (typeof EMAIL_INTENTS)[number];

export interface EmailPayload {
  link?: string;
  code?: string;
  name?: string;
}

const INTENT_CATEGORY: Record<EmailIntent, EmailCategory> = {
  "magic-link": "login",
  verification: "confirmation",
  "password-reset": "recovery",
  "email-change": "email_change",
  welcome: "welcome",
  // Rendered by the app (no Brevo template): category "welcome" resolves to ID 0.
  "workspace-owner-invite": "welcome",
  "workspace-member-onboarding": "welcome",
};

/** Statisch register: intent × taal → Brevo-template-ID (O(1), geen DB). */
export const TEMPLATE_REGISTRY: Readonly<Record<EmailIntent, Partial<Record<EmailLocale, number>>>> =
  Object.freeze(
    Object.fromEntries(
      EMAIL_INTENTS.map((intent) => {
        const ids = EMAIL_TEMPLATE_IDS[INTENT_CATEGORY[intent]] ?? {};
        const row: Partial<Record<EmailLocale, number>> = {};
        for (const l of EMAIL_LOCALES) if (ids[l]) row[l] = ids[l];
        return [intent, Object.freeze(row)];
      }),
    ) as Record<EmailIntent, Partial<Record<EmailLocale, number>>>,
  );

/** Onbekende talen → 'en'. `fr-BE` → `fr`. */
export function normalizeLocale(value: unknown): EmailLocale {
  if (typeof value !== "string") return "en";
  const short = value.trim().toLowerCase().slice(0, 8).split(/[-_]/)[0] ?? "";
  return (EMAIL_LOCALES as readonly string[]).includes(short) ? (short as EmailLocale) : "en";
}

export function isEmailIntent(value: unknown): value is EmailIntent {
  return typeof value === "string" && (EMAIL_INTENTS as readonly string[]).includes(value);
}

/** Taalspecifieke ID → Engelse ID → globale reserve (#21) → 0 (inline tekst). */
export function resolveTemplateId(intent: EmailIntent, locale: EmailLocale): number {
  const row = TEMPLATE_REGISTRY[intent];
  return row[locale] ?? row.en ?? (INTENT_CATEGORY[intent] === "welcome" ? 0 : GLOBAL_FALLBACK_TEMPLATE_ID);
}

/** Taal uit `rout_lang`-cookie, dan Accept-Language, anders 'en'. */
export function localeFromRequest(request?: Request | null): EmailLocale {
  if (!request) return "en";
  const cookie = request.headers.get("cookie") ?? "";
  const m = /(?:^|;\s*)rout_lang=([^;]*)/.exec(cookie);
  if (m?.[1]) {
    const fromCookie = normalizeLocale(decodeURIComponent(m[1]));
    if (fromCookie !== "en" || /^en/i.test(m[1])) return fromCookie;
  }
  return normalizeLocale((request.headers.get("accept-language") ?? "").split(",")[0]);
}

const cap = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");

export interface SendLocalizedEmailInput {
  to: string;
  intent?: EmailIntent;
  /** Alias van `intent`. */
  type?: EmailIntent;
  locale?: unknown;
  payload?: EmailPayload;
}

/** Clean text/plain part for every auth mail (multipart, no HTML remnants). */
export function authPlainText(subject: string, code: string, link: string, to: string): string {
  return [
    subject,
    "",
    ...(code ? [`Code: ${code}`, ""] : []),
    ...(link ? [link, ""] : []),
    `Deze transactionele beveiligingsmail is verzonden naar ${to} wegens een inlogpoging op rout.be. Als jij dit niet was, kun je dit veilig negeren. ROUT is een soevereine infrastructuur, gehost in Europa.`,
  ].join("\n");
}

async function dispatch(input: SendLocalizedEmailInput): Promise<boolean> {
  const intent = input.intent ?? input.type;
  const locale = normalizeLocale(input.locale);
  const to = cap(input.to, 254).trim().toLowerCase();
  try {
    if (!isEmailIntent(intent)) {
      console.error("[email] dispatch failed", { reason: "unknown_intent", intent });
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      console.error("[email] dispatch failed", { reason: "invalid_recipient", intent });
      return false;
    }
    const link = cap(input.payload?.link, 2048);
    const code = cap(input.payload?.code, 64);
    const name = cap(input.payload?.name, 120);
    const { sendMail } = await import("@/emails/send.server");
    // Eén ROUT-design voor elke auth-mail; de Brevo-template blijft vangnet.
    const { renderAuthMail } = await import("@/emails/design/mails");
    const { subject, html } = renderAuthMail(intent, locale, { link, code, name, to });
    const result = await sendMail({
      html,
      htmlFirst: true,
      language: locale,
      to,
      subject,
      templateId: resolveTemplateId(intent, locale) || undefined,
      text: authPlainText(subject, code, link, to),
      params: {
        LINK: link,
        MAGIC_LINK: link,
        url: link,
        link,
        CODE: code,
        code,
        token: code,
        NAME: name,
        LANG: locale,
      },
      tags: ["otp", "auth", `auth-${intent}`],
    });
    if (!result.sent) {
      console.error("[email] dispatch failed", { intent, locale, error: result.error ?? "unknown" });
    }
    return result.sent;
  } catch (err) {
    console.error("[email] dispatch failed", {
      intent,
      locale,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Stuurt een gelokaliseerde mail zonder de aanroeper te blokkeren of te laten
 * crashen. Resolvet altijd (nooit reject).
 */
export async function sendLocalizedEmail(input: SendLocalizedEmailInput): Promise<void> {
  const task = dispatch(input);
  // Admin portal: wait for the result so a refused mail reaches the sign-in screen.
  const { isAdminMode } = await import("@/lib/app-mode");
  if (isAdminMode()) {
    const sent = await task;
    if (!sent) throw new Error("Inlogmail kon niet verzonden worden. Probeer het later opnieuw.");
    return;
  }
  if (registerBackgroundTask(task)) return;
  // Without lifetime support, do not abandon the delivery when the request ends.
  await task;
}
