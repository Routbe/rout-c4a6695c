/**
 * 24 avatarkaders ("avatar frames") voor publieke ROUT-profielen.
 *
 * Elk kader is puur CSS (gradients, conic-gradients, box-shadows) met optioneel
 * één lichte SVG-overlay. Zo blijft het profiel snel, thema-bewust en zonder
 * externe assets. De keuze wordt bewaard in `display_prefs.avatarFrame`.
 */

export type AvatarFrame =
  | "none"
  | "laurel_gold"
  | "cyber_neon"
  | "emerald_ivy"
  | "nordic_frost"
  | "royal_crown"
  | "minimal_double"
  | "steampunk_gear"
  | "cosmic_halo"
  | "fire_glow"
  | "glass_crystal"
  | "matrix_code"
  | "vintage_wood"
  | "sunset_gold"
  | "dark_void"
  | "diamond_edge"
  | "gold_chain"
  | "blood_moon"
  | "cyber_hex"
  | "floral_bloom"
  | "chrome_steel"
  | "pixel_retro"
  | "hologram"
  | "vampire_goth"
  | `gen_${string}`;

export type AvatarFrameCategory =
  | "minimal"
  | "cyber"
  | "royal"
  | "nature"
  | "neon"
  | "dark"
  | "kawaii"
  | "abstract";

/** Overlay-tekening bovenop de rand (klein, decoratief). */
export type AvatarFrameOverlay =
  "laurel" | "crown" | "gear" | "chain" | "flower" | "lace" | "pixel" | "hex" | null;

export type AvatarFrameDef = {
  id: AvatarFrame;
  label: string;
  category: AvatarFrameCategory;
  overlay?: AvatarFrameOverlay;
  /** Animatieklasse uit styles.css (rout-frame-*). */
  animation?: string;
  /** Extra zoekwoorden (NL + EN). */
  keywords?: string;
};

/* ------------------------------------------------ gegenereerde kaders (80) */

type GenStyle = "ring" | "duo" | "conic" | "glow" | "dash" | "double" | "thick" | "aura";

const GEN_STYLES: { id: GenStyle; label: string; anim?: string }[] = [
  { id: "ring", label: "ring" },
  { id: "duo", label: "duo" },
  { id: "conic", label: "draai", anim: "rout-frame-spin" },
  { id: "glow", label: "gloed", anim: "rout-frame-pulse" },
  { id: "dash", label: "stippel" },
  { id: "double", label: "dubbel" },
  { id: "thick", label: "breed" },
  { id: "aura", label: "aura", anim: "rout-frame-shimmer" },
];

const GEN_PALETTES: {
  id: string;
  label: string;
  category: AvatarFrameCategory;
  keywords: string;
  c: [string, string, string];
}[] = [
  { id: "synthwave", label: "Synthwave", category: "neon", keywords: "neon retro 80s pink", c: ["#f0abfc", "#a855f7", "#22d3ee"] },
  { id: "acid", label: "Acid", category: "neon", keywords: "neon lime green rave", c: ["#bef264", "#22c55e", "#facc15"] },
  { id: "tokyo", label: "Tokyo nacht", category: "cyber", keywords: "cyber sci-fi city night", c: ["#38bdf8", "#6366f1", "#f43f5e"] },
  { id: "circuit", label: "Circuit", category: "cyber", keywords: "cyber tech sci-fi teal", c: ["#2dd4bf", "#0f766e", "#a7f3d0"] },
  { id: "imperial", label: "Imperiaal", category: "royal", keywords: "royal purple gold crown", c: ["#fde68a", "#7c3aed", "#facc15"] },
  { id: "ruby", label: "Robijn", category: "royal", keywords: "royal red jewel gem", c: ["#fecdd3", "#be123c", "#fb7185"] },
  { id: "sakura", label: "Sakura", category: "kawaii", keywords: "kawaii anime pink cute", c: ["#fbcfe8", "#f9a8d4", "#fdf2f8"] },
  { id: "candy", label: "Snoep", category: "kawaii", keywords: "kawaii pastel cute sweet", c: ["#a5f3fc", "#f9a8d4", "#fde68a"] },
  { id: "forest", label: "Woud", category: "nature", keywords: "nature green moss leaf", c: ["#86efac", "#166534", "#d9f99d"] },
  { id: "ocean", label: "Oceaan", category: "nature", keywords: "nature sea blue water", c: ["#67e8f9", "#0369a1", "#e0f2fe"] },
  { id: "obsidian", label: "Obsidiaan", category: "dark", keywords: "dark fantasy black goth", c: ["#52525b", "#09090b", "#a1a1aa"] },
  { id: "necro", label: "Necro", category: "dark", keywords: "dark fantasy green poison", c: ["#4ade80", "#14532d", "#18181b"] },
  { id: "mono", label: "Mono", category: "minimal", keywords: "minimal black white clean", c: ["#fafafa", "#27272a", "#a1a1aa"] },
  { id: "sand", label: "Zand", category: "minimal", keywords: "minimal beige warm calm", c: ["#e7e5e4", "#a8a29e", "#f5f5f4"] },
  { id: "prism", label: "Prisma", category: "abstract", keywords: "abstract rainbow colour", c: ["#f87171", "#60a5fa", "#facc15"] },
  { id: "lava", label: "Lava", category: "abstract", keywords: "abstract orange fire red", c: ["#fdba74", "#dc2626", "#fde047"] },
];

const GEN_DEFS: AvatarFrameDef[] = GEN_PALETTES.flatMap((p) =>
  GEN_STYLES.map((st) => ({
    id: `gen_${p.id}_${st.id}` as AvatarFrame,
    label: `${p.label} ${st.label}`,
    category: p.category,
    animation: st.anim,
    keywords: `${p.keywords} ${st.label}`,
  })),
);

function genFrameStyle(frame: string, theme: FrameTheme): Record<string, string | number> | null {
  const m = /^gen_([a-z]+)_([a-z]+)$/.exec(frame);
  if (!m) return null;
  const pal = GEN_PALETTES.find((p) => p.id === m[1]);
  if (!pal) return null;
  const [a, b, c] = pal.c;
  const base = { borderRadius: 999 };
  switch (m[2] as GenStyle) {
    case "ring":
      return { ...base, padding: 3, background: a };
    case "duo":
      return { ...base, padding: 4, background: `linear-gradient(135deg,${a},${b})` };
    case "conic":
      return { ...base, padding: 4, background: `conic-gradient(${a},${b},${c},${a})` };
    case "glow":
      return { ...base, padding: 3, background: a, boxShadow: `0 0 22px -2px ${b}` };
    case "dash":
      return { ...base, padding: 3, border: `3px dashed ${a}` };
    case "double":
      return { ...base, padding: 6, border: `2px solid ${a}`, boxShadow: `inset 0 0 0 3px ${theme.bg}, inset 0 0 0 5px ${b}` };
    case "thick":
      return { ...base, padding: 7, background: `linear-gradient(180deg,${a},${b})` };
    case "aura":
      return { ...base, padding: 4, background: `linear-gradient(120deg,${a},${c},${b})`, boxShadow: `0 0 0 4px ${a}33, 0 0 30px -6px ${c}` };
    default:
      return null;
  }
}

function genAccent(frame: string): string | null {
  const m = /^gen_([a-z]+)_/.exec(frame);
  return m ? (GEN_PALETTES.find((p) => p.id === m[1])?.c[0] ?? null) : null;
}

const BASE_FRAME_DEFS: AvatarFrameDef[] = [
  { id: "none", label: "Standaard", category: "minimal" },
  { id: "minimal_double", label: "Dubbele lijn", category: "minimal" },
  { id: "glass_crystal", label: "Gematteerd glas", category: "minimal" },
  { id: "chrome_steel", label: "Chroom staal", category: "minimal" },
  { id: "diamond_edge", label: "Diamant snede", category: "minimal" },
  { id: "sunset_gold", label: "Zonsondergang", category: "minimal" },

  { id: "cyber_neon", label: "Cyber neon", category: "cyber", animation: "rout-frame-pulse" },
  { id: "matrix_code", label: "Matrix code", category: "cyber", animation: "rout-frame-pulse" },
  { id: "cyber_hex", label: "Cyber hex", category: "cyber", overlay: "hex" },
  { id: "hologram", label: "Hologram", category: "cyber", animation: "rout-frame-shimmer" },
  { id: "pixel_retro", label: "Pixel retro", category: "cyber", overlay: "pixel" },
  {
    id: "steampunk_gear",
    label: "Steampunk tandwiel",
    category: "cyber",
    overlay: "gear",
    animation: "rout-frame-spin",
  },

  { id: "laurel_gold", label: "Gouden lauwer", category: "royal", overlay: "laurel" },
  { id: "royal_crown", label: "Koninklijke kroon", category: "royal", overlay: "crown" },
  { id: "gold_chain", label: "Gouden ketting", category: "royal", overlay: "chain" },
  { id: "cosmic_halo", label: "Kosmische halo", category: "royal", animation: "rout-frame-pulse" },
  { id: "vintage_wood", label: "Vintage hout", category: "royal" },
  { id: "fire_glow", label: "Vuurgloed", category: "royal", animation: "rout-frame-flicker" },

  { id: "emerald_ivy", label: "Smaragd klimop", category: "nature", overlay: "flower" },
  {
    id: "nordic_frost",
    label: "Noordse vorst",
    category: "nature",
    animation: "rout-frame-shimmer",
  },
  { id: "floral_bloom", label: "Bloesem", category: "nature", overlay: "flower" },
  { id: "dark_void", label: "Dark void", category: "nature" },
  { id: "blood_moon", label: "Blood moon", category: "nature", animation: "rout-frame-pulse" },
  { id: "vampire_goth", label: "Gothic kant", category: "nature", overlay: "lace" },
];

export const AVATAR_FRAME_DEFS: AvatarFrameDef[] = [...BASE_FRAME_DEFS, ...GEN_DEFS];

export const AVATAR_FRAME_IDS = AVATAR_FRAME_DEFS.map((f) => f.id);

/** Populaire keuzes, bovenaan getoond. */
export const POPULAR_FRAMES: AvatarFrame[] = [
  "laurel_gold",
  "cyber_neon",
  "hologram",
  "gen_synthwave_glow",
  "gen_sakura_duo",
  "royal_crown",
];

export const AVATAR_FRAME_CATEGORIES: { id: "all" | AvatarFrameCategory; label: string }[] = [
  { id: "all", label: "Alles" },
  { id: "minimal", label: "Minimal" },
  { id: "cyber", label: "Gaming / Cyber" },
  { id: "royal", label: "Royal" },
  { id: "nature", label: "Natuur" },
  { id: "neon", label: "Neon" },
  { id: "dark", label: "Dark Fantasy" },
  { id: "kawaii", label: "Kawaii" },
  { id: "abstract", label: "Abstract" },
];

export function avatarFrameLabel(id: AvatarFrame): string {
  return AVATAR_FRAME_DEFS.find((f) => f.id === id)?.label ?? "Standaard";
}

export function avatarFrameDef(id: AvatarFrame): AvatarFrameDef {
  return AVATAR_FRAME_DEFS.find((f) => f.id === id) ?? AVATAR_FRAME_DEFS[0]!;
}

/** Oude, kortere kader-ids uit eerdere versies van de studio. */
const LEGACY: Record<string, AvatarFrame> = {
  gold: "laurel_gold",
  neon: "cyber_neon",
  double: "minimal_double",
  aurora: "cosmic_halo",
};

export function normalizeAvatarFrame(value: unknown): AvatarFrame {
  if (typeof value !== "string") return "none";
  if (AVATAR_FRAME_IDS.includes(value as AvatarFrame)) return value as AvatarFrame;
  return LEGACY[value] ?? "none";
}

export type FrameTheme = {
  bg: string;
  card: string;
  text: string;
  border: string;
  accent?: string;
};

/** CSS voor de wrapper rond de avatar (padding + rand + gloed). */
export function avatarFrameStyle(
  frame: AvatarFrame,
  theme: FrameTheme,
): Record<string, string | number> {
  const gen = genFrameStyle(frame, theme);
  if (gen) return gen;
  const accent = theme.accent ?? theme.border;
  const ring = (padding: number, extra: Record<string, string | number>) => ({
    padding,
    borderRadius: 999,
    ...extra,
  });

  switch (frame) {
    case "laurel_gold":
      return ring(4, {
        background: "linear-gradient(135deg,#f4e2b0,#c9a84c 45%,#8a6a24)",
        boxShadow: "0 8px 26px -12px rgba(232,200,122,0.85)",
      });
    case "cyber_neon":
      return ring(3, {
        background: `linear-gradient(135deg,#22d3ee,#d946ef)`,
        boxShadow: "0 0 0 3px rgba(34,211,238,0.18), 0 0 28px -4px rgba(217,70,239,0.75)",
      });
    case "emerald_ivy":
      return ring(4, {
        background: "conic-gradient(from 90deg,#166534,#4ade80,#065f46,#22c55e,#166534)",
        boxShadow: "0 8px 26px -14px rgba(34,197,94,0.7)",
      });
    case "nordic_frost":
      return ring(4, {
        background: "linear-gradient(160deg,#e0f2fe,#7dd3fc 40%,#f8fafc)",
        boxShadow: "0 0 0 3px rgba(125,211,252,0.22), 0 0 24px -6px rgba(224,242,254,0.9)",
      });
    case "royal_crown":
      return ring(4, {
        background: "linear-gradient(180deg,#fde68a,#b45309 60%,#fcd34d)",
        boxShadow: "0 10px 30px -14px rgba(180,83,9,0.9)",
      });
    case "minimal_double":
      return ring(5, {
        border: `1px solid ${theme.border}`,
        boxShadow: `inset 0 0 0 3px ${theme.bg}, inset 0 0 0 4px ${accent}`,
      });
    case "steampunk_gear":
      return ring(4, {
        background: "linear-gradient(140deg,#b08d57,#6b4f2a 50%,#d6b98c)",
        boxShadow: "inset 0 0 0 2px rgba(0,0,0,0.35), 0 8px 24px -14px rgba(107,79,42,0.9)",
      });
    case "cosmic_halo":
      return ring(4, {
        background: "conic-gradient(from 180deg,#312e81,#8b5cf6,#22d3ee,#f472b6,#312e81)",
        boxShadow: "0 10px 34px -16px rgba(139,92,246,0.9)",
      });
    case "fire_glow":
      return ring(4, {
        background: "linear-gradient(160deg,#fbbf24,#ea580c 55%,#7f1d1d)",
        boxShadow: "0 0 0 3px rgba(234,88,12,0.22), 0 0 30px -4px rgba(249,115,22,0.85)",
      });
    case "glass_crystal":
      return ring(5, {
        background: "linear-gradient(140deg,rgba(255,255,255,0.45),rgba(255,255,255,0.08))",
        border: "1px solid rgba(255,255,255,0.55)",
        backdropFilter: "blur(12px) saturate(140%)",
      });
    case "matrix_code":
      return ring(4, {
        background: "repeating-conic-gradient(from 0deg,#052e16 0deg 6deg,#22c55e 6deg 9deg)",
        boxShadow: "0 0 0 2px rgba(34,197,94,0.25), 0 0 26px -6px rgba(34,197,94,0.9)",
      });
    case "vintage_wood":
      return ring(6, {
        background:
          "repeating-linear-gradient(120deg,#4b2e17 0px,#4b2e17 6px,#5d3a1e 6px,#5d3a1e 12px)",
        boxShadow: "inset 0 0 0 2px rgba(0,0,0,0.4), 0 8px 22px -14px rgba(0,0,0,0.8)",
      });
    case "sunset_gold":
      return ring(4, {
        background: "linear-gradient(135deg,#fb7185,#f59e0b 60%,#fde68a)",
        boxShadow: "0 12px 30px -16px rgba(251,113,133,0.9)",
      });
    case "dark_void":
      return ring(4, {
        background: "radial-gradient(circle at 50% 30%,#1f2937,#000000)",
        boxShadow: "0 0 0 3px rgba(0,0,0,0.7), 0 0 34px -6px rgba(127,29,29,0.75)",
      });
    case "diamond_edge":
      return ring(4, {
        background:
          "conic-gradient(from 45deg,#e5e7eb 0deg 30deg,#94a3b8 30deg 60deg,#f8fafc 60deg 90deg,#64748b 90deg 120deg,#e5e7eb 120deg)",
        boxShadow: "0 8px 24px -14px rgba(148,163,184,0.9)",
      });
    case "gold_chain":
      return ring(5, {
        background: "repeating-conic-gradient(from 0deg,#c9a84c 0deg 10deg,#8a6a24 10deg 20deg)",
        boxShadow: "0 8px 24px -14px rgba(201,168,76,0.9)",
      });
    case "blood_moon":
      return ring(4, {
        background: "radial-gradient(circle at 50% 20%,#7f1d1d,#3b0a0a 70%,#000)",
        boxShadow: "0 0 0 3px rgba(127,29,29,0.35), 0 0 30px -4px rgba(185,28,28,0.85)",
      });
    case "cyber_hex":
      return ring(4, {
        background: "linear-gradient(150deg,#1f2937,#0f172a)",
        border: "1px solid rgba(59,130,246,0.55)",
        boxShadow: "0 0 0 2px rgba(59,130,246,0.18), 0 0 22px -6px rgba(59,130,246,0.9)",
      });
    case "floral_bloom":
      return ring(5, {
        background: "conic-gradient(from 0deg,#fbcfe8,#fef9c3,#ddd6fe,#fbcfe8)",
        boxShadow: "0 8px 24px -14px rgba(244,114,182,0.7)",
      });
    case "chrome_steel":
      return ring(4, {
        background: "linear-gradient(180deg,#f8fafc,#94a3b8 35%,#475569 55%,#e2e8f0 75%,#94a3b8)",
        boxShadow: "0 8px 24px -14px rgba(71,85,105,0.9)",
      });
    case "pixel_retro":
      return {
        padding: 5,
        borderRadius: 6,
        background:
          "repeating-linear-gradient(90deg,#22d3ee 0 6px,#0ea5e9 6px 12px,#f472b6 12px 18px)",
        boxShadow: "0 0 0 3px #0f172a",
      };
    case "hologram":
      return ring(4, {
        background: "linear-gradient(115deg,#a5f3fc,#c4b5fd 30%,#fbcfe8 55%,#bbf7d0 80%,#a5f3fc)",
        backgroundSize: "220% 220%",
        boxShadow: "0 8px 28px -14px rgba(165,243,252,0.9)",
      });
    case "vampire_goth":
      return ring(5, {
        background: "repeating-conic-gradient(from 0deg,#0b0b0f 0deg 8deg,#450a0a 8deg 12deg)",
        boxShadow: "inset 0 0 0 2px rgba(0,0,0,0.75), 0 0 26px -8px rgba(69,10,10,0.95)",
      });
    default:
      return { padding: 0, borderRadius: 999 };
  }
}

// ---------------------------------------------------------------------------
// Fallback voor trage toestellen
// ---------------------------------------------------------------------------

/** Basiskleur per kader voor de goedkope terugvalweergave. */
const FALLBACK_ACCENT: Partial<Record<AvatarFrame, string>> = {
  laurel_gold: "#c9a84c",
  cyber_neon: "#22d3ee",
  emerald_ivy: "#22c55e",
  nordic_frost: "#7dd3fc",
  royal_crown: "#b45309",
  steampunk_gear: "#b08d57",
  cosmic_halo: "#818cf8",
  fire_glow: "#f97316",
  glass_crystal: "#e2e8f0",
  matrix_code: "#22c55e",
  vintage_wood: "#92400e",
  sunset_gold: "#fb923c",
  dark_void: "#334155",
  diamond_edge: "#a5b4fc",
  gold_chain: "#f4e2b0",
  blood_moon: "#b91c1c",
  cyber_hex: "#3b82f6",
  floral_bloom: "#f472b6",
  chrome_steel: "#cbd5e1",
  pixel_retro: "#0f172a",
  hologram: "#38bdf8",
  vampire_goth: "#7f1d1d",
};

/**
 * Goedkope variant van een kader: één effen rand, geen gradients, gloed of
 * animatie. Wordt gebruikt op trage toestellen, bij "verminderde beweging" en
 * bij databesparing, zodat een publiek profiel daar even snel blijft renderen.
 */
export function avatarFrameFallbackStyle(
  frame: AvatarFrame,
  theme: FrameTheme,
): Record<string, string | number> {
  if (frame === "none") return avatarFrameStyle(frame, theme);
  const color = genAccent(frame) ?? (FALLBACK_ACCENT as Record<string, string>)[frame] ?? theme.accent ?? theme.border;
  return {
    padding: 4,
    borderRadius: 999,
    background: color,
    border: `1px solid ${theme.border}`,
  };
}

/**
 * Bepaalt of de lichte kaderweergave gebruikt moet worden. Server-side (SSR)
 * kiezen we altijd de volledige versie zodat de HTML gelijk blijft; de client
 * schakelt na hydratatie terug wanneer het toestel dat vraagt.
 */
export function prefersLightFrames(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean; effectiveType?: string };
  };
  if (nav.connection?.saveData) return true;
  if (nav.connection?.effectiveType && /^(slow-)?2g$/.test(nav.connection.effectiveType))
    return true;
  if (
    typeof nav.hardwareConcurrency === "number" &&
    nav.hardwareConcurrency > 0 &&
    nav.hardwareConcurrency <= 2
  )
    return true;
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory > 0 && nav.deviceMemory <= 2)
    return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}
