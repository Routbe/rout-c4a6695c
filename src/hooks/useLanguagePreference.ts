import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { getPreferredLanguage, savePreferredLanguage } from "@/lib/language-preference.functions";
import { hasExplicitLocale, isLocale, useI18n, type Locale } from "@/lib/i18n";

/**
 * Central language preference.
 *
 * The account setting is the source of truth for signed-in members; visitors and
 * members without a stored choice fall back to the device choice (cookie /
 * localStorage) and finally the browser language. URLs never carry a locale.
 */
export function useLanguagePreference() {
  const { user } = useAuth();
  const { locale, setLocale, applyLocale } = useI18n();
  const getPreferredLanguageFn = useServerFn(getPreferredLanguage);
  const savePreferredLanguageFn = useServerFn(savePreferredLanguage);
  const [stored, setStored] = useState<Locale | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setStored(null);
      setLoading(false);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const { locale: value } = await getPreferredLanguageFn();
        if (!alive) return;
        const next = isLocale(value) ? value : null;
        setStored(next);
        // The account preference wins, unless this device has an explicit choice
        // that the member made more recently in the header switcher.
        if (next && !hasExplicitLocale()) applyLocale(next);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user, applyLocale, getPreferredLanguageFn]);

  const save = useCallback(
    async (next: Locale) => {
      setLocale(next);
      setStored(next);
      if (!user) return { error: null };
      const result = await savePreferredLanguageFn({ data: { locale: next } });
      return { error: result.ok ? null : new Error(result.message ?? "save_failed") };
    },
    [setLocale, user, savePreferredLanguageFn],
  );

  return { language: stored ?? locale, stored, save, loading };
}
