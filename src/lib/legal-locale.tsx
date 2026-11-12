import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/** Locales offered on the legal documents. */
export const LEGAL_LOCALES = ["en", "nl", "fr", "de", "es", "pt-BR", "zh", "ja", "hi"] as const;
export type LegalLocale = (typeof LEGAL_LOCALES)[number];

/** Shown as pills in the header. */
export const PRIMARY_LOCALES: { id: LegalLocale; label: string; name: string }[] = [
  { id: "nl", label: "NL", name: "Nederlands" },
  { id: "fr", label: "FR", name: "Français" },
  { id: "en", label: "EN", name: "English" },
];

/** Shown inside the globe dropdown. */
export const EXTENDED_LOCALES: { id: LegalLocale; label: string; name: string }[] = [
  { id: "de", label: "DE", name: "Deutsch" },
  { id: "es", label: "ES", name: "Español" },
  { id: "pt-BR", label: "PT-BR", name: "Português (BR)" },
  { id: "zh", label: "ZH", name: "中文" },
  { id: "ja", label: "JA", name: "日本語" },
  { id: "hi", label: "HI", name: "हिन्दी" },
];

const STORAGE_KEY = "rout.legal.locale";

function isLegalLocale(value: string | null | undefined): value is LegalLocale {
  return !!value && (LEGAL_LOCALES as readonly string[]).includes(value);
}

/** localStorage preference wins, then the browser language, then English. */
function detect(): LegalLocale {
  if (typeof window === "undefined") return "en";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLegalLocale(saved)) return saved;
  } catch {
    /* private mode */
  }
  const nav = window.navigator.language ?? "en";
  if (isLegalLocale(nav)) return nav;
  const base = nav.split("-")[0]?.toLowerCase();
  if (base === "pt") return "pt-BR";
  if (isLegalLocale(base)) return base;
  return "en";
}

interface Ctx {
  locale: LegalLocale;
  setLocale: (l: LegalLocale) => void;
}

const LegalLocaleContext = createContext<Ctx | null>(null);

export function LegalLocaleProvider({ children }: { children: ReactNode }) {
  // Start on 'en' so SSR and the first client render agree, then adopt the
  // stored/browser preference after hydration.
  const [locale, setLocaleState] = useState<LegalLocale>("en");

  useEffect(() => {
    const detected = detect();
    if (detected !== "en") setLocaleState(detected);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      locale,
      setLocale: (l) => {
        setLocaleState(l);
        try {
          window.localStorage.setItem(STORAGE_KEY, l);
        } catch {
          /* private mode */
        }
      },
    }),
    [locale],
  );

  return <LegalLocaleContext.Provider value={value}>{children}</LegalLocaleContext.Provider>;
}

export function useLegalLocale(): Ctx {
  const ctx = useContext(LegalLocaleContext);
  if (!ctx) throw new Error("useLegalLocale must be used inside <LegalLocaleProvider>");
  return ctx;
}
