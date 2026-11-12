import { LOCALES, LOCALE_LABELS, useI18n, type Locale } from "@/lib/i18n";
import { useLanguagePreference } from "@/hooks/useLanguagePreference";
export function LocaleDropdown() {
  const { locale, t } = useI18n();
  const { save } = useLanguagePreference();
  return <select aria-label={t("ai.bio.language")} value={locale} onChange={e => void save(e.target.value as Locale)} className="rounded-lg border border-current/20 bg-transparent px-2 py-1 text-xs">{LOCALES.map(l => <option key={l} value={l} className="bg-background text-foreground">{LOCALE_LABELS[l]}</option>)}</select>;
}
