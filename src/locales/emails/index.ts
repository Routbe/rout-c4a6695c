/**
 * E-mailteksten per taal. Nieuwe taal = één object toevoegen.
 * Placeholders: {{magic_link}}, {{otp_code}}, {{user_handle}}.
 */
import nl from "./nl.json";
import en from "./en.json";
import fr from "./fr.json";
import de from "./de.json";

export const EMAIL_DICTS = { nl, en, fr, de } as const;
export type EmailDictLocale = keyof typeof EMAIL_DICTS;
export type EmailTextKey = keyof typeof en;

export function interpolate(text: string, vars: Record<string, string | undefined>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}

/** Taal → Engels → Nederlands. */
export function emailT(locale: string, key: EmailTextKey, vars: Record<string, string | undefined> = {}): string {
  const dict = (EMAIL_DICTS as Record<string, Partial<Record<EmailTextKey, string>>>)[locale];
  const raw = dict?.[key] ?? en[key] ?? (nl as Record<string, string>)[key] ?? "";
  return interpolate(raw, vars);
}
