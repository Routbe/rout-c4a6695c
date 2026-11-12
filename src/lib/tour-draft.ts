import {
  BACKGROUND_STYLES,
  FONT_PAIRINGS,
  FOOTER_STYLES,
  WALLPAPER_TYPES,
  type BackgroundStyle,
  type FontPairing,
  type FooterStyle,
  type Typography,
  type WallpaperType,
} from "@/lib/profile-display";

/** Alles wat de publieke rondleiding verzamelt vóór er een account bestaat. */
export type TourDraft = {
  /** Anoniem concept-token: hiermee vindt het account het concept in Neon terug. */
  token: string;
  handle: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  /** Mediakanalen: `{ instagram: "@jona" }` — leeg = niet getoond. */
  socials: Record<string, string>;
  theme: string;
  backgroundStyle: BackgroundStyle;
  wallpaperType: WallpaperType;
  wallpaperColor: string;
  wallpaperGradient: string;
  typography: Typography;
  fontPairing: FontPairing;
  footerTagline: string;
  footerStyle: FooterStyle;
  footerAccent: string;
  showRoutBadge: boolean;
  email: string;
  step: number;
};

/** Aantal stappen in de rondleiding (index 0 … LAST_TOUR_STEP). */
export const LAST_TOUR_STEP = 7;

export function newTourToken(): string {
  // Altijd cryptografisch willekeurig; nooit Math.random (raadbaar).
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return `t_${Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export const EMPTY_TOUR_DRAFT: TourDraft = {
  token: "",
  handle: "",
  displayName: "",
  bio: "",
  avatarUrl: "",
  socials: {},
  theme: "noir",
  backgroundStyle: "solid",
  wallpaperType: "theme",
  wallpaperColor: "",
  wallpaperGradient: "obsidian",
  typography: "sans",
  fontPairing: "modern",
  footerTagline: "",
  footerStyle: "plain",
  footerAccent: "",
  showRoutBadge: true,
  email: "",
  step: 0,
};

export const TOUR_DRAFT_KEY = "rout_tour_draft";

const isTypography = (value: unknown): value is Typography =>
  value === "sans" || value === "serif" || value === "mono";

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/** Tolerant parser: onbekende of kapotte velden vallen terug op de standaard. */
export function parseTourDraft(input: unknown): TourDraft {
  if (!input || typeof input !== "object") return { ...EMPTY_TOUR_DRAFT };
  const raw = input as Record<string, unknown>;
  const str = (key: string) => (typeof raw[key] === "string" ? (raw[key] as string) : "");
  const step = typeof raw["step"] === "number" ? raw["step"] : 0;

  const socials: Record<string, string> = {};
  const rawSocials = raw["socials"];
  if (rawSocials && typeof rawSocials === "object") {
    for (const [key, value] of Object.entries(rawSocials as Record<string, unknown>)) {
      if (typeof value === "string" && value.trim()) socials[key] = value.trim().slice(0, 200);
    }
  }

  return {
    token: str("token"),
    handle: str("handle"),
    displayName: str("displayName"),
    bio: str("bio"),
    avatarUrl: str("avatarUrl"),
    socials,
    theme: str("theme") || EMPTY_TOUR_DRAFT.theme,
    backgroundStyle: pick(
      raw["backgroundStyle"],
      BACKGROUND_STYLES.map((o) => o.id),
      "solid",
    ),
    wallpaperType: pick(
      raw["wallpaperType"],
      WALLPAPER_TYPES.map((o) => o.id),
      "theme",
    ),
    wallpaperColor: str("wallpaperColor"),
    wallpaperGradient: str("wallpaperGradient") || "obsidian",
    typography: isTypography(raw["typography"]) ? raw["typography"] : "sans",
    fontPairing: pick(
      raw["fontPairing"],
      FONT_PAIRINGS.map((o) => o.id),
      "modern",
    ),
    footerTagline: str("footerTagline").slice(0, 80),
    footerStyle: pick(
      raw["footerStyle"],
      FOOTER_STYLES.map((o) => o.id),
      "plain",
    ),
    footerAccent: str("footerAccent"),
    showRoutBadge: raw["showRoutBadge"] === undefined ? true : Boolean(raw["showRoutBadge"]),
    email: str("email"),
    step: Math.min(Math.max(Math.trunc(step), 0), LAST_TOUR_STEP),
  };
}

/** Leest het concept uit deze browser (nooit blokkerend). */
export function readLocalTourDraft(): TourDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TOUR_DRAFT_KEY);
    return raw ? parseTourDraft(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeLocalTourDraft(draft: TourDraft) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOUR_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* privémodus zonder storage: het serverconcept vangt dit op */
  }
}

export function clearLocalTourDraft() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOUR_DRAFT_KEY);
  } catch {
    /* niets te doen */
  }
}
