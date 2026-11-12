import { TITLE_EFFECTS, TITLE_ENTRANCES, type TitleEffect, type TitleEntrance } from "./title-typography";
import {
  DEFAULT_GLASS,
  DEFAULT_GLASS_TARGETS,
  normalizeGlassTargets,
  normalizeGlassTokens,
  normalizeThemeOverrides,
  type GlassTargets,
  type GlassTokens,
  type ThemeOverrides,
} from "@/lib/theme-engine";
import { EXTRA_FOOTER_STYLES, extraFooterCss, type ExtraFooterStyle } from "@/lib/footer-styles-extra";
/**
 * ROUT Design Studio — thema-presets, wallpapers, knopstijlen, typografie en
 * footer/branding. Alles leeft als extra velden binnen `profiles.display_prefs`
 * (zie `profile-display.ts`), zodat er geen migratie nodig is per knopje.
 */

export type WallpaperType = "theme" | "solid" | "gradient" | "image" | "mesh-flow" | "grid-scroll" | "fluid-wave";

export const ANIMATED_WALLPAPERS: readonly WallpaperType[] = ["mesh-flow", "grid-scroll", "fluid-wave"];
export type ButtonVariant =
  | "fill"
  | "outline"
  | "glass"
  | "hard"
  | "soft"
  | "gradient"
  | "neon"
  | "ghost";
export type ButtonRadius = "pill" | "rounded" | "sharp" | "soft" | "xl";
export type ButtonSize = "sm" | "md" | "lg" | "xl";
/** Extra hover-/rustanimatie op de linkknoppen. */
export type ButtonEffect = "none" | "lift" | "glow" | "press" | "shine" | "pulse";
export type FontPairing =
  | "modern"
  | "serif"
  | "mono"
  | "display"
  | "editorial"
  | "geometric"
  | "brutal"
  | "luxe"
  | "handwritten"
  | "futuristic"
  | "classic"
  | "condensed";
export type SocialPosition = "top" | "bottom" | "footer";
/** Vormgeving van de voettekst onderaan het profiel. */
export type FooterStyle =
  | "plain"
  | "divider"
  | "card"
  | "glow"
  | "stamp"
  | "ticker"
  | "grass"
  | "wave"
  | "neonbar"
  | "tape"
  | "gradient"
  | "dotted"
  | ExtraFooterStyle;
/** Uitlijning van de avatar onder de banner. */
export type AvatarAlign = "left" | "center" | "right";

export interface ProfileDesignPrefs {
  /** Custom mode: pas als dit aanstaat overschrijven de knoppen hieronder het preset. */
  customDesign: boolean;
  backgroundCustom: boolean;
  buttonsCustom: boolean;
  typographyCustom: boolean;
  wallpaperType: WallpaperType;
  wallpaperColor: string | null;
  /** Id uit `GRADIENT_PRESETS`. */
  wallpaperGradient: string;
  /** Richting uit `GRADIENT_DIRECTIONS`; `auto` behoudt die van het preset. */
  wallpaperGradientDirection: GradientDirection;
  wallpaperImageUrl: string | null;
  /** 0–24 px blur over de achtergrondafbeelding. */
  wallpaperBlur: number;
  /** 0–90 % zwarte overlay over de achtergrondafbeelding. */
  wallpaperOverlay: number;
  buttonVariant: ButtonVariant;
  buttonRadius: ButtonRadius;
  /** "bar" = knop met naam; "icon" = ronde bol met alleen het icoon (naam blijft voor schermlezers). */
  buttonShape: "bar" | "icon" | "both";
  buttonSize: ButtonSize;
  buttonEffect: ButtonEffect;
  buttonColor: string | null;
  buttonTextColor: string | null;
  /** Optional outline colour for buttons (Knopvorm → Knoprand); null = variant default. */
  buttonBorderColor: string | null;
  fontPairing: FontPairing;
  /** Basis-lettergrootte in procenten (85–125). */
  fontScale: number;
  /** Titelgrootte in procenten (80–180). */
  titleScale: number;
  titleColor: string | null;
  /** Letterafstand van de profielnaam (-1–12 px). */
  titleLetterSpacing: number;
  /** Gloedsterkte van de profielnaam (0–40 px). */
  titleGlow: number;
  /** Elemental Typography Engine — see title-typography.ts. */
  titleGradientTo: string | null;
  titleShadowBlur: number;
  titleShadowX: number;
  titleShadowY: number;
  titleShadowColor: string | null;
  titleEffect: TitleEffect;
  titleEntrance: TitleEntrance;
  /** How far the entrance has revealed the name (0–100). */
  titleReveal: number;
  /** Hoogte van de banner in px (0 = automatisch). */
  bannerHeight: number;
  /** Diameter van de avatar in px. */
  avatarSize: number;
  avatarAlign: AvatarAlign;
  /** Hoeveel de avatar over de banner schuift (px). */
  avatarOverlap: number;
  footerTagline: string | null;
  /** Stijl van het footerblok. */
  footerStyle: FooterStyle;
  /** Accentkleur voor de footer (lijn, gloed, stempelrand). */
  footerAccent: string | null;
  /** "Powered by ROUT"-badge tonen (Pro-leden mogen dit uitzetten). */
  showRoutBadge: boolean;
  socialPosition: SocialPosition;
  /** Global glass tokens (theme.global) — see theme-engine.ts. */
  glassStyle: GlassTokens["glassStyle"];
  glassOpacity: number;
  glassBlur: number;
  glassBorder: GlassTokens["glassBorder"];
  glassSaturation: number;
  glassRefraction: number;
  glassAberration: number;
  glassSpecular: number;
  glassTargets: GlassTargets;
  /** Per-component overrides (theme.overrides[scope]). */
  themeOverrides: ThemeOverrides;
}

export const FOOTER_STYLES: { id: FooterStyle; label: string; hint: string }[] = [
  { id: "plain", label: "Eenvoudig", hint: "Alleen tekst" },
  { id: "divider", label: "Fijne lijn", hint: "Scheidingslijn boven" },
  { id: "card", label: "Kaartje", hint: "Zacht kader" },
  { id: "glow", label: "Gloed", hint: "Accentgloed" },
  { id: "stamp", label: "Stempel", hint: "Uppercase kader" },
  { id: "ticker", label: "Ticker", hint: "Rollende tekst" },
  { id: "grass", label: "Gras", hint: "Grasrand onderaan" },
  { id: "wave", label: "Golf", hint: "Golvende rand" },
  { id: "neonbar", label: "Neonbalk", hint: "Oplichtende balk" },
  { id: "tape", label: "Plakband", hint: "Schuin tapestrookje" },
  { id: "gradient", label: "Verloop", hint: "Zacht kleurverloop" },
  { id: "dotted", label: "Stippellijn", hint: "Gestippelde rand" },
  ...EXTRA_FOOTER_STYLES.map(({ id, label, hint }) => ({ id, label, hint })),
];

/** Footerstijlen met een decoratieve SVG-laag boven het blok. */
export const FOOTER_DECORATIONS: FooterStyle[] = ["grass", "wave"];

export const BUTTON_SIZES: { id: ButtonSize; label: string }[] = [
  { id: "sm", label: "Compact" },
  { id: "md", label: "Normaal" },
  { id: "lg", label: "Groot" },
  { id: "xl", label: "Extra groot" },
];

export const BUTTON_EFFECTS: { id: ButtonEffect; label: string; hint: string }[] = [
  { id: "none", label: "Geen", hint: "Statisch" },
  { id: "lift", label: "Optillen", hint: "Zweeft omhoog bij hover" },
  { id: "glow", label: "Gloed", hint: "Accentgloed bij hover" },
  { id: "press", label: "Indrukken", hint: "Zakt in bij klik" },
  { id: "shine", label: "Glans", hint: "Lichtstreep glijdt over" },
  { id: "pulse", label: "Puls", hint: "Zachte ademhaling" },
];

/** Hoogte/typografie per knopmaat. */
export const buttonSizeStyle = (size: ButtonSize): Record<string, string | number> => {
  switch (size) {
    case "sm":
      return { minHeight: 40, padding: "8px 14px", fontSize: "0.8125rem" };
    case "lg":
      return { minHeight: 60, padding: "16px 20px", fontSize: "0.975rem" };
    case "xl":
      return { minHeight: 72, padding: "20px 24px", fontSize: "1.05rem" };
    default:
      return { minHeight: 48, padding: "12px 16px", fontSize: "0.875rem" };
  }
};

/** Tailwind/CSS-klasse voor het hover-effect (gedefinieerd in styles.css). */
export const buttonEffectClass = (effect: ButtonEffect): string =>
  effect === "none" ? "" : `rout-btn-${effect}`;


/** CSS voor het footerblok, afgeleid van stijl + accentkleur. */
export function footerBlockStyle(
  style: FooterStyle,
  accent: string | null,
  theme: { border: string; card: string; muted: string },
): Record<string, string | number> {
  const a = accent ?? theme.border;
  switch (style) {
    case "divider":
      return { borderTop: `1px solid ${a}`, paddingTop: 16, width: "100%" };
    case "card":
      return {
        border: `1px solid ${a}`,
        background: theme.card,
        borderRadius: 16,
        padding: "12px 18px",
      };
    case "glow":
      return {
        borderRadius: 999,
        padding: "10px 20px",
        border: `1px solid ${a}`,
        boxShadow: `0 0 28px -8px ${a}`,
      };
    case "stamp":
      return {
        border: `2px dashed ${a}`,
        borderRadius: 8,
        padding: "10px 18px",
        textTransform: "uppercase",
        letterSpacing: "0.18em",
      };
    case "ticker":
      return {
        borderTop: `1px solid ${a}`,
        borderBottom: `1px solid ${a}`,
        padding: "8px 0",
        width: "100%",
        overflow: "hidden",
      };
    case "grass":
      return { paddingTop: 28, width: "100%", position: "relative" };
    case "wave":
      return { paddingTop: 34, width: "100%", position: "relative" };
    case "neonbar":
      return {
        borderTop: `2px solid ${a}`,
        paddingTop: 16,
        width: "100%",
        boxShadow: `0 -14px 32px -18px ${a}`,
      };
    case "tape":
      return {
        background: `color-mix(in oklab, ${a} 22%, transparent)`,
        border: `1px dashed ${a}`,
        padding: "10px 22px",
        transform: "rotate(-1.4deg)",
        borderRadius: 4,
      };
    case "gradient":
      return {
        width: "100%",
        paddingTop: 20,
        backgroundImage: `linear-gradient(180deg, transparent, color-mix(in oklab, ${a} 26%, transparent))`,
        borderRadius: 20,
      };
    case "dotted":
      return { borderTop: `2px dotted ${a}`, paddingTop: 16, width: "100%" };
    default:
      return extraFooterCss(style, a, theme) ?? {};
  }
}

export const DEFAULT_DESIGN_PREFS: ProfileDesignPrefs = {
  customDesign: false,
  backgroundCustom: false,
  buttonsCustom: false,
  typographyCustom: false,
  wallpaperType: "theme",
  wallpaperColor: null,
  wallpaperGradient: "obsidian",
  wallpaperGradientDirection: "auto",
  wallpaperImageUrl: null,
  wallpaperBlur: 0,
  wallpaperOverlay: 40,
  buttonVariant: "fill",
  buttonRadius: "rounded",
  buttonShape: "bar",
  buttonSize: "md",
  buttonEffect: "none",
  buttonColor: null,
  buttonTextColor: null,
  buttonBorderColor: null,
  fontPairing: "modern",
  fontScale: 100,
  titleScale: 100,
  titleColor: null,
  titleLetterSpacing: 0,
  titleGlow: 0,
  titleGradientTo: null,
  titleShadowBlur: 0,
  titleShadowX: 0,
  titleShadowY: 0,
  titleShadowColor: null,
  titleEffect: "none",
  titleEntrance: "none",
  titleReveal: 100,
  bannerHeight: 128,
  avatarSize: 80,
  avatarAlign: "center",
  avatarOverlap: 40,
  footerTagline: null,
  footerStyle: "plain",
  footerAccent: null,
  showRoutBadge: true,
  socialPosition: "top",
  ...DEFAULT_GLASS,
  glassTargets: DEFAULT_GLASS_TARGETS,
  themeOverrides: {},
};


/* ------------------------------------------------------------ presets */

/** Curated ROUT luxury themes — een klik zet thema + knoppen + typografie. */
export const ROUT_PRESETS: {
  id: string;
  label: string;
  themeId: string;
  cardStyle: string;
  design: Partial<ProfileDesignPrefs>;
}[] = [
  {
    id: "noir",
    label: "Noir",
    themeId: "noir",
    cardStyle: "bordered",
    design: {
      wallpaperType: "solid",
      wallpaperColor: "#0d0d0d",
      buttonVariant: "outline",
      buttonRadius: "sharp",
      fontPairing: "modern",
    },
  },
  {
    id: "paper",
    label: "Paper",
    themeId: "papier",
    cardStyle: "solid",
    design: {
      wallpaperType: "solid",
      wallpaperColor: "#f7f4ef",
      buttonVariant: "fill",
      buttonRadius: "rounded",
      fontPairing: "serif",
    },
  },
  {
    id: "serene",
    label: "Serene Glass",
    themeId: "arctic",
    cardStyle: "glass",
    design: {
      wallpaperType: "gradient",
      wallpaperGradient: "nordic",
      buttonVariant: "glass",
      buttonRadius: "pill",
      fontPairing: "modern",
    },
  },
  {
    id: "emerald",
    label: "Emerald Core",
    themeId: "emerald",
    cardStyle: "neon",
    design: {
      wallpaperType: "gradient",
      wallpaperGradient: "emerald",
      buttonVariant: "glass",
      buttonRadius: "rounded",
      fontPairing: "display",
    },
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    themeId: "cyberpunk",
    cardStyle: "neon",
    design: {
      wallpaperType: "gradient",
      wallpaperGradient: "cyber",
      buttonVariant: "hard",
      buttonRadius: "sharp",
      fontPairing: "mono",
    },
  },
  {
    id: "velvet",
    label: "Velvet",
    themeId: "mocha",
    cardStyle: "pill",
    design: {
      wallpaperType: "gradient",
      wallpaperGradient: "velvet",
      buttonVariant: "fill",
      buttonRadius: "pill",
      fontPairing: "serif",
    },
  },
  {
    id: "rout-default",
    label: "ROUT Default",
    themeId: "rout-default",
    cardStyle: "bordered",
    design: { wallpaperType: "solid", wallpaperColor: "#ffffff", buttonVariant: "fill", buttonRadius: "rounded", fontPairing: "modern" },
  },
  {
    id: "obsidian-dark",
    label: "Obsidian Dark",
    themeId: "obsidian-dark",
    cardStyle: "sharp",
    design: { wallpaperType: "solid", wallpaperColor: "#07080a", buttonVariant: "outline", buttonRadius: "sharp", fontPairing: "mono" },
  },
  {
    id: "biophilic",
    label: "Biophilic Minimal",
    themeId: "biophilic",
    cardStyle: "pill",
    design: { wallpaperType: "solid", wallpaperColor: "#efe9dd", buttonVariant: "soft", buttonRadius: "xl", fontPairing: "editorial" },
  },
  {
    id: "inkt",
    label: "Flat Hand-Drawn",
    themeId: "inkt",
    cardStyle: "bordered",
    design: { wallpaperType: "solid", wallpaperColor: "#fbf8f1", buttonVariant: "hard", buttonRadius: "soft", fontPairing: "handwritten" },
  },
];

/** Kant-en-klare lineaire/mesh gradients voor de achtergrond. */
export const GRADIENT_PRESETS: { id: string; label: string; css: string }[] = [
  {
    id: "obsidian",
    label: "Dark Obsidian",
    css: "radial-gradient(60rem 40rem at 20% 0%, #1f2937 0%, transparent 60%), linear-gradient(180deg, #0b0b0f 0%, #05050a 100%)",
  },
  {
    id: "sunrise",
    label: "Sunrise",
    css: "linear-gradient(160deg, #ff9a5a 0%, #ff5f6d 45%, #3b1c4a 100%)",
  },
  {
    id: "nordic",
    label: "Nordic Mist",
    css: "radial-gradient(50rem 30rem at 10% 10%, #dbeafe 0%, transparent 60%), linear-gradient(180deg, #f8fbff 0%, #e6eef7 100%)",
  },
  {
    id: "emerald",
    label: "Emerald Depth",
    css: "radial-gradient(45rem 30rem at 80% 0%, #10b98155 0%, transparent 60%), linear-gradient(180deg, #04211a 0%, #021410 100%)",
  },
  {
    id: "cyber",
    label: "Cyber Violet",
    css: "radial-gradient(40rem 28rem at 15% 5%, #a855f766 0%, transparent 60%), radial-gradient(38rem 26rem at 85% 30%, #22d3ee44 0%, transparent 62%), #08060f",
  },
  {
    id: "velvet",
    label: "Velvet Mocha",
    css: "radial-gradient(45rem 30rem at 50% 0%, #c0845766 0%, transparent 60%), linear-gradient(180deg, #1b1310 0%, #0d0806 100%)",
  },
  {
    id: "aurora",
    label: "Aurora",
    css: "radial-gradient(40rem 26rem at 20% 0%, #22d3ee55 0%, transparent 62%), radial-gradient(42rem 28rem at 80% 20%, #4ade8055 0%, transparent 60%), radial-gradient(36rem 24rem at 50% 90%, #a78bfa44 0%, transparent 62%), #06070f",
  },
  {
    id: "peach",
    label: "Peach Cream",
    css: "linear-gradient(170deg, #ffe7d1 0%, #ffd0c2 45%, #fbb1a4 100%)",
  },
  {
    id: "midnight",
    label: "Midnight Indigo",
    css: "radial-gradient(50rem 32rem at 30% 0%, #4f46e555 0%, transparent 60%), linear-gradient(180deg, #0a0a1a 0%, #141432 100%)",
  },
  {
    id: "sakura",
    label: "Sakura",
    css: "radial-gradient(38rem 26rem at 15% 5%, #fbcfe8 0%, transparent 60%), linear-gradient(180deg, #fff5f8 0%, #f8d8e4 100%)",
  },
  {
    id: "sunsetblaze",
    label: "Sunset Blaze",
    css: "linear-gradient(150deg, #ff6b35 0%, #e84393 55%, #6c5ce7 100%)",
  },
  {
    id: "matcha",
    label: "Matcha",
    css: "radial-gradient(42rem 28rem at 80% 0%, #a7f3d0 0%, transparent 62%), linear-gradient(180deg, #f2f7ef 0%, #dbe9d5 100%)",
  },
  {
    id: "noirgold",
    label: "Noir & Gold",
    css: "radial-gradient(44rem 30rem at 50% 0%, #c9a84c44 0%, transparent 60%), linear-gradient(180deg, #0d0d0d 0%, #050505 100%)",
  },
  {
    id: "ocean",
    label: "Ocean Deep",
    css: "radial-gradient(46rem 30rem at 20% 10%, #2d8a9e66 0%, transparent 62%), linear-gradient(180deg, #0c2340 0%, #061524 100%)",
  },
  {
    id: "candy",
    label: "Candy Pop",
    css: "linear-gradient(160deg, #c4b5fd 0%, #67e8f9 50%, #fecaca 100%)",
  },
  {
    id: "carbon",
    label: "Carbon",
    css: "repeating-linear-gradient(45deg, #141414 0 6px, #101010 6px 12px)",
  },
  {
    id: "steel",
    label: "Brushed Steel",
    css: "linear-gradient(180deg, #3a4553 0%, #1f2733 60%, #141a22 100%)",
  },
];

/** Richting van het achtergrondverloop. `auto` = de oorspronkelijke richting van het preset. */
export const GRADIENT_DIRECTIONS = [
  { id: "auto", label: "Origineel", angle: null },
  { id: "to-bottom", label: "Boven → onder", angle: "180deg" },
  { id: "to-right", label: "Links → rechts", angle: "90deg" },
  { id: "diag-down", label: "Diagonaal ↘", angle: "135deg" },
  { id: "diag-up", label: "Diagonaal ↗", angle: "45deg" },
  { id: "radial", label: "Vanuit midden", angle: "radial" },
] as const;
export type GradientDirection = (typeof GRADIENT_DIRECTIONS)[number]["id"];

export const normalizeGradientDirection = (v: unknown): GradientDirection =>
  GRADIENT_DIRECTIONS.some((d) => d.id === v) ? (v as GradientDirection) : "auto";

export const gradientCss = (id: string, direction: string = "auto") => {
  const css = (GRADIENT_PRESETS.find((g) => g.id === id) ?? GRADIENT_PRESETS[0]!).css;
  const dir = GRADIENT_DIRECTIONS.find((d) => d.id === direction);
  if (!dir || !dir.angle) return css;
  if (dir.angle === "radial") return css.replace(/linear-gradient\(\s*\d+deg\s*,/g, "radial-gradient(circle at 50% 35%,");
  return css.replace(/linear-gradient\(\s*\d+deg\s*,/g, `linear-gradient(${dir.angle},`);
};

/** Snelkeuze-palet voor alle kleurvelden in de studio. */
export const COLOR_SWATCHES: { label: string; colors: string[] }[] = [
  {
    label: "Neutraal",
    colors: [
      "#000000",
      "#0d0d0d",
      "#1a1a1a",
      "#2d2d2d",
      "#4a4a4a",
      "#718096",
      "#a0aec0",
      "#e2e8f0",
      "#f5f3ee",
      "#ffffff",
    ],
  },
  {
    label: "Warm",
    colors: [
      "#7f1d1d",
      "#b91c1c",
      "#ef4444",
      "#f97316",
      "#f59e0b",
      "#fcd34d",
      "#e85d3a",
      "#c4654a",
      "#a0522d",
      "#8b7355",
    ],
  },
  {
    label: "Koel",
    colors: [
      "#0c2340",
      "#1e3a5f",
      "#2563eb",
      "#3b82f6",
      "#22d3ee",
      "#5cbdb9",
      "#0d7a5f",
      "#22c55e",
      "#a7f3d0",
      "#e0f2fe",
    ],
  },
  {
    label: "Luxe",
    colors: [
      "#c9a84c",
      "#f0d78c",
      "#e8c07a",
      "#8a6a24",
      "#4f46e5",
      "#a855f7",
      "#c9a0dc",
      "#e88aab",
      "#064e3b",
      "#1b1310",
    ],
  },
];

/* -------------------------------------------------------- typography */

export const FONT_PAIRINGS: {
  id: FontPairing;
  label: string;
  note: string;
  heading: string;
  body: string;
}[] = [
  {
    id: "modern",
    label: "Modern Sans",
    note: "Inter + DM Sans",
    heading: "'Inter', ui-sans-serif, system-ui, sans-serif",
    body: "'DM Sans', ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: "serif",
    label: "Elegant Serif",
    note: "Playfair Display + Lora",
    heading: "'Playfair Display', ui-serif, Georgia, serif",
    body: "'Lora', ui-serif, Georgia, serif",
  },
  {
    id: "mono",
    label: "Monospace Tech",
    note: "JetBrains Mono + Geist Mono",
    heading: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
    body: "'Geist Mono', 'JetBrains Mono', ui-monospace, monospace",
  },
  {
    id: "display",
    label: "Display Bold",
    note: "Cabinet Grotesk + Plus Jakarta Sans",
    heading: "'Cabinet Grotesk', 'Space Grotesk', ui-sans-serif, sans-serif",
    body: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: "editorial",
    label: "Editorial",
    note: "Instrument Serif + Work Sans",
    heading: "'Instrument Serif', ui-serif, Georgia, serif",
    body: "'Work Sans', ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: "geometric",
    label: "Geometrisch",
    note: "Outfit + Figtree",
    heading: "'Outfit', ui-sans-serif, system-ui, sans-serif",
    body: "'Figtree', ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: "brutal",
    label: "Brutalist",
    note: "Archivo Black + Hind",
    heading: "'Archivo Black', 'Arial Black', ui-sans-serif, sans-serif",
    body: "'Hind', ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: "luxe",
    label: "Luxe Fashion",
    note: "Cormorant + Karla",
    heading: "'Cormorant Garamond', ui-serif, Georgia, serif",
    body: "'Karla', ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: "handwritten",
    label: "Handgeschreven",
    note: "Caveat + Nunito Sans",
    heading: "'Caveat', 'Segoe Script', cursive",
    body: "'Nunito Sans', ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: "futuristic",
    label: "Futuristisch",
    note: "Orbitron + Rajdhani",
    heading: "'Orbitron', 'Space Grotesk', ui-sans-serif, sans-serif",
    body: "'Rajdhani', ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: "classic",
    label: "Klassiek",
    note: "Libre Baskerville + IBM Plex Sans",
    heading: "'Libre Baskerville', ui-serif, Georgia, serif",
    body: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif",
  },
  {
    id: "condensed",
    label: "Condensed Impact",
    note: "Bebas Neue + Barlow",
    heading: "'Bebas Neue', 'Oswald', ui-sans-serif, sans-serif",
    body: "'Barlow', ui-sans-serif, system-ui, sans-serif",
  },
];


export const fontPairingOf = (id: FontPairing) =>
  FONT_PAIRINGS.find((f) => f.id === id) ?? FONT_PAIRINGS[0]!;

export const BUTTON_VARIANTS: { id: ButtonVariant; label: string; note: string }[] = [
  { id: "fill", label: "Fill", note: "Effen vlak met contrasterende tekst" },
  { id: "outline", label: "Outline", note: "Transparant met randlijn" },
  { id: "glass", label: "Glassmorphism", note: "Doorschijnend met blur" },
  { id: "hard", label: "Hard Shadow", note: "Retro slagschaduw" },
  { id: "soft", label: "Soft Shadow", note: "Zachte diepteschaduw" },
  { id: "gradient", label: "Gradient", note: "Kleurverloop over de knop" },
  { id: "neon", label: "Neon", note: "Oplichtende rand" },
  { id: "ghost", label: "Ghost", note: "Alleen tekst, subtiele hover" },
];

export const BUTTON_RADII: { id: ButtonRadius; label: string; px: number }[] = [
  { id: "pill", label: "Pill", px: 999 },
  { id: "xl", label: "Extra rond", px: 18 },
  { id: "rounded", label: "Rounded", px: 11 },
  { id: "soft", label: "Zacht", px: 5 },
  { id: "sharp", label: "Sharp", px: 0 },
];


export const SOCIAL_POSITIONS: { id: SocialPosition; label: string }[] = [
  { id: "top", label: "Bovenaan profiel" },
  { id: "bottom", label: "Onderaan profiel" },
  { id: "footer", label: "In de voettekst" },
];

export const WALLPAPER_TYPES: { id: WallpaperType; label: string }[] = [
  { id: "theme", label: "Volg thema" },
  { id: "solid", label: "Effen kleur" },
  { id: "gradient", label: "Gradient" },
  { id: "image", label: "Eigen afbeelding" },
  { id: "mesh-flow", label: "Vloeiend mesh" },
  { id: "grid-scroll", label: "Scrollend raster" },
  { id: "fluid-wave", label: "Golvend weefsel" },
];

/* ------------------------------------------------------------- styles */

/** Achtergrondlagen voor de gekozen wallpaper. `null` = val terug op het thema. */
export function wallpaperStyle(
  d: ProfileDesignPrefs,
  theme: { bg: string },
): Record<string, string> | null {
  if (!(d.backgroundCustom || d.customDesign) || d.wallpaperType === "theme") return null;
  if (d.wallpaperType === "solid") return { background: d.wallpaperColor ?? theme.bg };
  if (d.wallpaperType === "gradient") return { background: gradientCss(d.wallpaperGradient, d.wallpaperGradientDirection) };
  if (ANIMATED_WALLPAPERS.includes(d.wallpaperType)) return { background: d.wallpaperColor ?? theme.bg };
  if (d.wallpaperType === "image" && d.wallpaperImageUrl) {
    // De afbeelding zelf komt in een eigen laag binnen de pagina
    // (`wallpaperImageLayerStyle`), zodat blur nooit buiten het profiel lekt.
    return { background: d.wallpaperColor ?? theme.bg };
  }
  return null;
}

/**
 * Achtergrondafbeelding als eigen laag *binnen* de profielpagina.
 *
 * De blur zit op de afbeelding zelf (`filter`), niet op `backdrop-filter`.
 * Met `backdrop-filter` werd alles achter de laag vervaagd — in de Studio dus
 * de hele editor rondom de preview in plaats van enkel de profielachtergrond.
 */
export function wallpaperImageLayerStyle(d: ProfileDesignPrefs): Record<string, string> | null {
  if (!(d.backgroundCustom || d.customDesign) || d.wallpaperType !== "image" || !d.wallpaperImageUrl) return null;
  return {
    backgroundImage: `url("${d.wallpaperImageUrl}")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    filter: `blur(${d.wallpaperBlur}px)`,
    // Iets uitvergroten zodat de blur geen doorschijnende randen geeft.
    transform: d.wallpaperBlur > 0 ? "scale(1.08)" : "none",
  };
}

/** Verduistering bovenop de achtergrondafbeelding (zonder blur). */
export function wallpaperOverlayStyle(d: ProfileDesignPrefs): Record<string, string> | null {
  if (!(d.backgroundCustom || d.customDesign) || d.wallpaperType !== "image" || !d.wallpaperImageUrl) return null;
  return { background: `rgba(0,0,0,${(d.wallpaperOverlay / 100).toFixed(2)})` };
}

/** Knopstijl uit de custom designinstellingen. `null` = val terug op het thema. */
export function designButtonStyle(
  d: ProfileDesignPrefs,
  theme: { bg: string; card: string; text: string; border: string; accent?: string },
): Record<string, string | number> | null {
  if (!(d.buttonsCustom || d.customDesign)) return null;
  const style = variantButtonStyle(d, theme);
  if (!d.buttonBorderColor) return style;
  return { ...style, border: `${d.buttonVariant === "hard" ? 2 : 1}px solid ${d.buttonBorderColor}` };
}

function variantButtonStyle(
  d: ProfileDesignPrefs,
  theme: { bg: string; card: string; text: string; border: string; accent?: string },
): Record<string, string | number> {
  const radius = (BUTTON_RADII.find((r) => r.id === d.buttonRadius) ?? BUTTON_RADII[2]!).px;
  const accent = d.buttonColor ?? theme.accent ?? theme.card;
  const text = d.buttonTextColor ?? theme.text;
  const base: Record<string, string | number> = {
    borderRadius: radius,
    ...buttonSizeStyle(d.buttonSize),
  };
  switch (d.buttonVariant) {
    case "outline":
      return { ...base, background: "transparent", color: text, border: `1px solid ${accent}` };
    case "glass":
      return {
        ...base,
        background: `color-mix(in oklab, ${accent} 18%, transparent)`,
        color: text,
        border: `1px solid color-mix(in oklab, ${text} 20%, transparent)`,
        backdropFilter: "blur(14px) saturate(140%)",
      };
    case "hard":
      return {
        ...base,
        background: accent,
        color: d.buttonTextColor ?? theme.bg,
        border: `2px solid ${theme.text}`,
        boxShadow: `4px 4px 0px ${theme.text}`,
      };
    case "soft":
      return {
        ...base,
        background: accent,
        color: d.buttonTextColor ?? theme.bg,
        border: "1px solid transparent",
        boxShadow: `0 14px 34px -16px ${accent}, 0 2px 6px -2px rgba(0,0,0,.25)`,
      };
    case "gradient":
      return {
        ...base,
        backgroundImage: `linear-gradient(135deg, ${accent}, color-mix(in oklab, ${accent} 40%, ${theme.text}))`,
        color: d.buttonTextColor ?? theme.bg,
        border: "1px solid transparent",
      };
    case "neon":
      return {
        ...base,
        background: `color-mix(in oklab, ${accent} 12%, transparent)`,
        color: text,
        border: `1px solid ${accent}`,
        boxShadow: `0 0 0 1px color-mix(in oklab, ${accent} 25%, transparent), 0 10px 32px -10px ${accent}`,
      };
    case "ghost":
      return {
        ...base,
        background: "transparent",
        color: text,
        border: "1px solid transparent",
      };
    default:
      return {
        ...base,
        background: accent,
        color: d.buttonTextColor ?? theme.bg,
        border: "1px solid transparent",
      };
  }
}


/* --------------------------------------------------------- normalizer */

const num = (value: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

const hex = (value: unknown): string | null =>
  typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value.trim()) ? value.trim() : null;

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const clean = value.trim().slice(0, max);
  return clean || null;
};

const httpsUrl = (value: unknown): string | null =>
  typeof value === "string" && /^https?:\/\//.test(value.trim()) ? value.trim() : null;

/** Leest de designvelden veilig uit een (mogelijk oude) display_prefs-blob. */
export function normalizeDesignPrefs(r: Record<string, unknown>): ProfileDesignPrefs {
  return {
    customDesign: Boolean(r["customDesign"]),
    backgroundCustom: r["backgroundCustom"] === undefined ? Boolean(r["customDesign"]) : Boolean(r["backgroundCustom"]),
    buttonsCustom: r["buttonsCustom"] === undefined ? Boolean(r["customDesign"]) : Boolean(r["buttonsCustom"]),
    typographyCustom: r["typographyCustom"] === undefined ? Boolean(r["customDesign"]) : Boolean(r["typographyCustom"]),
    wallpaperType: pick(
      r["wallpaperType"],
      ["theme", "solid", "gradient", "image", "mesh-flow", "grid-scroll", "fluid-wave"] as const,
      "theme",
    ),
    wallpaperColor: hex(r["wallpaperColor"]),
    wallpaperGradient: GRADIENT_PRESETS.some((g) => g.id === r["wallpaperGradient"])
      ? (r["wallpaperGradient"] as string)
      : "obsidian",
    wallpaperGradientDirection: normalizeGradientDirection(r["wallpaperGradientDirection"]),
    wallpaperImageUrl: httpsUrl(r["wallpaperImageUrl"]),
    wallpaperBlur: num(r["wallpaperBlur"], 0, 24, 0),
    wallpaperOverlay: num(r["wallpaperOverlay"], 0, 90, 40),
    buttonVariant: pick(
      r["buttonVariant"],
      BUTTON_VARIANTS.map((v) => v.id),
      "fill",
    ),
    buttonRadius: pick(
      r["buttonRadius"],
      BUTTON_RADII.map((v) => v.id),
      "rounded",
    ),
    buttonShape: pick(r["buttonShape"], ["bar", "icon", "both"] as const, "bar"),
    buttonSize: pick(
      r["buttonSize"],
      BUTTON_SIZES.map((v) => v.id),
      "md",
    ),
    buttonEffect: pick(
      r["buttonEffect"],
      BUTTON_EFFECTS.map((v) => v.id),
      "none",
    ),
    buttonColor: hex(r["buttonColor"]),
    buttonTextColor: hex(r["buttonTextColor"]),
    buttonBorderColor: hex(r["buttonBorderColor"]),
    fontPairing: pick(
      r["fontPairing"],
      FONT_PAIRINGS.map((f) => f.id),
      "modern",
    ),
    fontScale: num(r["fontScale"], 85, 125, 100),
    titleScale: num(r["titleScale"], 80, 180, 100),
    titleColor: hex(r["titleColor"]),
    titleLetterSpacing: num(r["titleLetterSpacing"], -1, 12, 0),
    titleGlow: num(r["titleGlow"], 0, 40, 0),
    titleGradientTo: hex(r["titleGradientTo"]),
    titleShadowBlur: num(r["titleShadowBlur"], 0, 40, 0),
    titleShadowX: num(r["titleShadowX"], -20, 20, 0),
    titleShadowY: num(r["titleShadowY"], -20, 20, 0),
    titleShadowColor: hex(r["titleShadowColor"]),
    titleEffect: pick(r["titleEffect"], TITLE_EFFECTS.map((e) => e.id), "none"),
    titleEntrance: pick(r["titleEntrance"], TITLE_ENTRANCES.map((e) => e.id), "none"),
    titleReveal: num(r["titleReveal"], 0, 100, 100),
    bannerHeight: num(r["bannerHeight"], 64, 360, 128),
    avatarSize: num(r["avatarSize"], 56, 160, 80),
    avatarAlign: pick(r["avatarAlign"], ["left", "center", "right"] as const, "center"),
    avatarOverlap: num(r["avatarOverlap"], 0, 90, 40),
    footerTagline: text(r["footerTagline"], 80),
    footerStyle: pick(
      r["footerStyle"],
      FOOTER_STYLES.map((f) => f.id),
      "plain",
    ),
    footerAccent: hex(r["footerAccent"]),
    showRoutBadge: r["showRoutBadge"] === undefined ? true : Boolean(r["showRoutBadge"]),
    socialPosition: pick(r["socialPosition"], ["top", "bottom", "footer"] as const, "top"),
    ...normalizeGlassTokens(r),
    glassTargets: normalizeGlassTargets(r["glassTargets"]),
    themeOverrides: normalizeThemeOverrides(r["themeOverrides"]),

  };
}

/** Instellingen die een ROUT-preset zet; sluit altijd de achtergrond-fijnregeling. */
export function presetPrefEntries(design: Record<string, unknown>): [string, unknown][] {
  return [...Object.entries(design).filter(([k]) => k !== "backgroundCustom"), ["backgroundCustom", false]];
}
