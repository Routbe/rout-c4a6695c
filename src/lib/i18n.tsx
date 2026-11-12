import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import i18next from "i18next";
import { I18nextProvider, useTranslation } from "react-i18next";

import en from "@/locales/en.json";
import nl from "@/locales/nl.json";
import fr from "@/locales/fr.json";
import de from "@/locales/de.json";
import authNL from "@/locales/auth/nl.json";
import authEN from "@/locales/auth/en.json";
import authFR from "@/locales/auth/fr.json";
import authDE from "@/locales/auth/de.json";
import studioNL from "@/locales/studio/nl.json";
import studioEN from "@/locales/studio/en.json";
import studioFR from "@/locales/studio/fr.json";
import studioDE from "@/locales/studio/de.json";

import aiNL from "@/locales/ai/nl.json";
import aiEN from "@/locales/ai/en.json";
import aiFR from "@/locales/ai/fr.json";
import aiDE from "@/locales/ai/de.json";
/** Per-page bundles: src/locales/pages/<page>.<locale>.json, merged per locale. */
const PAGE_BUNDLES = import.meta.glob<{ default: Record<string, string> }>("../locales/pages/*.json", { eager: true });
function pageBundle(locale: string): Record<string, string> {
  return Object.assign({}, ...Object.entries(PAGE_BUNDLES).filter(([path]) => path.endsWith(`.${locale}.json`)).map(([, mod]) => mod.default));
}

export type Locale = "nl" | "en" | "fr" | "de";

export const LOCALES: Locale[] = ["nl", "en", "fr", "de"];

export const LOCALE_LABELS: Record<Locale, string> = {
  nl: "Nederlands",
  en: "English",
  fr: "Français",
  de: "Deutsch",
};

export const STORAGE_KEY = "rout_lang";

/** Same name as the storage key so client and server read one source of truth. */
export const COOKIE_KEY = "rout_lang";

/**
 * Vertaalbundels blijven bewust los getypeerd: een `as const` over vier JSON-
 * bestanden van ~75 kB dwingt TypeScript diepe readonly-literaltypes te bouwen
 * en laat de typecheck van het hele project ontsporen.
 */
type TranslationBundle = Record<string, unknown>;

const RESOURCES: Record<Locale, { translation: TranslationBundle }> = {
  en: { translation: { ...(en as TranslationBundle), ...(authEN as TranslationBundle), ...(studioEN as TranslationBundle), ...(aiEN as TranslationBundle), ...(pageBundle("en") as TranslationBundle) } },
  nl: { translation: { ...(nl as TranslationBundle), ...(authNL as TranslationBundle), ...(studioNL as TranslationBundle), ...(aiNL as TranslationBundle), ...(pageBundle("nl") as TranslationBundle) } },
  fr: { translation: { ...(fr as TranslationBundle), ...(authFR as TranslationBundle), ...(studioFR as TranslationBundle), ...(aiFR as TranslationBundle), ...(pageBundle("fr") as TranslationBundle) } },
  de: { translation: { ...(de as TranslationBundle), ...(authDE as TranslationBundle), ...(studioDE as TranslationBundle), ...(aiDE as TranslationBundle), ...(pageBundle("de") as TranslationBundle) } },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as string[]).includes(value);
}

function readCookieLocale(): Locale | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`));
  const value = match?.[1] ? decodeURIComponent(match[1]) : null;
  return isLocale(value) ? value : null;
}

function writeCookieLocale(locale: Locale) {
  if (typeof document === "undefined") return;
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${COOKIE_KEY}=${locale}; path=/; max-age=${oneYear}; samesite=lax`;
}

/** Persist the choice in both the cookie and localStorage (best effort). */
export function persistLocale(locale: Locale) {
  writeCookieLocale(locale);
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* storage unavailable — the cookie still carries the choice */
  }
}

/**
 * Language resolution order: explicit choice (cookie, then localStorage), then
 * the browser or system language (Dutch/Flemish wins for `nl`), then English as
 * the international default. URLs stay flat and language-independent — the
 * locale never appears as a path prefix.
 */
export function detectLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const cookie = readCookieLocale();
  if (cookie) return cookie;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    /* storage unavailable — fall through to browser detection */
  }
  const langs = [navigator.language, ...(navigator.languages ?? [])].filter(Boolean);
  for (const raw of langs) {
    const tag = raw.toLowerCase();
    if (tag.startsWith("nl") || tag === "be" || tag.startsWith("nl-be")) return "nl";
    if (tag.startsWith("fr")) return "fr";
    if (tag.startsWith("de")) return "de";
    if (tag.startsWith("en")) return "en";
  }
  return "en";
}

/** True when the visitor already made an explicit choice on this device. */
export function hasExplicitLocale(): boolean {
  if (typeof window === "undefined") return false;
  if (readCookieLocale()) return true;
  try {
    return isLocale(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

/**
 * Last-resort fallback: when a key exists in no language file at all, render a
 * humanised version of the final segment instead of a raw technical key.
 */
function humaniseKey(key: string): string {
  const leaf = key.split(".").pop() ?? key;
  const words = leaf.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

if (!i18next.isInitialized) {
  void i18next.init({
    resources: RESOURCES,
    initAsync: false,
    lng: "en",
    // English first, Dutch second: a missing FR/DE string never shows a key.
    fallbackLng: ["en", "nl"],
    interpolation: { escapeValue: false },
    returnNull: false,
    returnEmptyString: false,
    // A written default (usually Dutch) beats a guessed label like "Verify Label".
    parseMissingKeyHandler: (key, defaultValue) => (typeof defaultValue === "string" && defaultValue.trim() ? defaultValue : humaniseKey(key)),
  });
}

export { i18next as i18n };

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  /** Applies a locale without persisting it (used for account-driven sync). */
  applyLocale: (l: Locale) => void;
  t: (key: string, params?: Record<string, unknown>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? "en");

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    void i18next.changeLanguage(l);
    persistLocale(l);
  }, []);

  /** Apply a locale coming from the account without overwriting the device choice. */
  const applyLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    void i18next.changeLanguage(l);
  }, []);

  // Detect once on mount unless a route pinned the locale explicitly.
  useEffect(() => {
    const next = initialLocale ?? detectLocale();
    setLocaleState(next);
    void i18next.changeLanguage(next);
  }, [initialLocale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback(
    (key: string, params?: Record<string, unknown>) =>
      i18next.getFixedT(locale)(key, params ?? {}) as string,
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, applyLocale, t }),
    [locale, setLocale, applyLocale, t],
  );

  return (
    <I18nextProvider i18n={i18next}>
      <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
    </I18nextProvider>
  );
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  // Safe fallback so components stay usable outside the provider.
  return {
    locale: (i18next.language as Locale) ?? "en",
    setLocale: () => {},
    applyLocale: () => {},
    t: (k, params) => i18next.t(k, params ?? {}) as string,
  };
}

export { useTranslation };
