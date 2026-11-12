/** Browser-safe parsing of Duolingo's public users endpoint (tested). */

export type DuolingoStatus = { username: string; streak: number; language: string | null; languageName: string | null; totalXp: number | null };

const NL_NAMES: Record<string, string> = {
  es: "Spaans", fr: "Frans", de: "Duits", it: "Italiaans", pt: "Portugees", en: "Engels", nl: "Nederlands",
  ja: "Japans", ko: "Koreaans", zh: "Chinees", "zh-CN": "Chinees", ru: "Russisch", ar: "Arabisch", tr: "Turks",
  sv: "Zweeds", no: "Noors", nb: "Noors", da: "Deens", pl: "Pools", el: "Grieks", he: "Hebreeuws", hi: "Hindi",
  ga: "Iers", cy: "Welsh", uk: "Oekraïens", vi: "Vietnamees", id: "Indonesisch", fi: "Fins", cs: "Tsjechisch",
  hu: "Hongaars", ro: "Roemeens", sw: "Swahili", la: "Latijn", eo: "Esperanto", hv: "Hoog-Valyrisch", kl: "Klingon",
  ht: "Haïtiaans Creools", yi: "Jiddisch", gn: "Guaraní", zu: "Zoeloe", gd: "Schots-Gaelisch", math: "Wiskunde", music: "Muziek", chess: "Schaken",
};

export function duolingoLanguageName(code: string | null | undefined, fallback?: string | null): string | null {
  if (!code) return fallback ?? null;
  return NL_NAMES[code] ?? NL_NAMES[code.split("-")[0] ?? ""] ?? fallback ?? code;
}

export const DUOLINGO_USER = /^[A-Za-z0-9_.-]{1,40}$/;

const int = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);

/** First user of `{ users: [...] }`; active course = the one matching learningLanguage, else the first. */
export function parseDuolingo(json: unknown): DuolingoStatus | null {
  const u = (json as { users?: unknown[] } | null)?.users?.[0] as Record<string, unknown> | undefined;
  if (!u || typeof u.username !== "string") return null;
  const courses = Array.isArray(u.courses) ? (u.courses as Record<string, unknown>[]) : [];
  const learning = typeof u.learningLanguage === "string" ? u.learningLanguage : null;
  const course = courses.find((c) => c.learningLanguage === learning) ?? courses[0];
  const code = learning ?? (typeof course?.learningLanguage === "string" ? course.learningLanguage : null);
  const title = typeof course?.title === "string" ? course.title : null;
  return {
    username: u.username,
    streak: int(u.streak) ?? 0,
    language: code,
    languageName: duolingoLanguageName(code, title),
    totalXp: int(u.totalXp),
  };
}
