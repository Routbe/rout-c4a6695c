/**
 * Perceptual colour harmonisation for Google Wallet passes (OKLab / OKLCH).
 * A member's raw colour is never used as-is: it is projected into OKLCH, its
 * lightness clamped into a dark matte band and its chroma capped, then mapped
 * back into sRGB (with gamut reduction) as a 6-digit hex.
 */
export type Hex6 = `#${string}`;
export type Rgb = { r: number; g: number; b: number }; // 0..1, gamma-encoded sRGB
export type OkLab = { L: number; a: number; b: number };
export type OkLch = { L: number; C: number; h: number }; // h in radians

export const HARMONY = {
  /** Jewel-tone lightness band (OKLab L): rich colour, still dark enough for Wallet's white text. */
  minL: 0.3,
  maxL: 0.44,
  /** Chroma window: never grey for a coloured profile, never neon (Google's "vibrant zone"). */
  minC: 0.05,
  maxC: 0.14,
  /** Below this chroma a colour is treated as neutral (hue is noise). */
  neutralC: 0.012,
  /** A canvas needs at least this chroma to lead the tile hue; otherwise the accent leads. */
  leadC: 0.04,
  /** White pass text must keep WCAG AA contrast on the tile. */
  minWhiteContrast: 4.5,
  /** Ambient glow behind the crest: brighter, still restrained. */
  glowL: 0.74,
  glowC: 0.12,
  graphite: { L: 0.255, C: 0.008, h: 4.4 },
  fallback: "#1f2128" as Hex6,
} as const;

const HEX = /^#?([0-9a-f]{6})$/i;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function parseHex(hex: string | null | undefined): Rgb | null {
  const m = HEX.exec(hex?.trim() ?? "");
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

export function toHex({ r, g, b }: Rgb): Hex6 {
  const c = (v: number) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

export function rgbToOklab({ r, g, b }: Rgb): OkLab {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** Linear (unclamped) sRGB; values outside 0..1 mean out of gamut. */
function oklabToLinear({ L, a, b }: OkLab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export const oklabToLch = ({ L, a, b }: OkLab): OkLch => ({ L, C: Math.hypot(a, b), h: Math.atan2(b, a) });
export const lchToOklab = ({ L, C, h }: OkLch): OkLab => ({ L, a: C * Math.cos(h), b: C * Math.sin(h) });

const inGamut = (lin: number[]) => lin.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** OKLCH → hex, reducing chroma (hue and lightness preserved) until in sRGB gamut. */
export function oklchToHex(lch: OkLch): Hex6 {
  let { C } = lch;
  let lin = oklabToLinear(lchToOklab({ ...lch, C }));
  for (let i = 0; i < 24 && !inGamut(lin); i++) {
    C *= 0.85;
    lin = oklabToLinear(lchToOklab({ ...lch, C }));
  }
  const [r, g, b] = lin.map((v) => toGamma(clamp(v, 0, 1))) as [number, number, number];
  return toHex({ r, g, b });
}

export const hexToOklch = (hex: string): OkLch | null => {
  const rgb = parseHex(hex);
  return rgb ? oklabToLch(rgbToOklab(rgb)) : null;
};

/** Definitive Google Wallet tile colour (hexBackgroundColor) for one member colour. */
export function harmonizeBackground(hex: string | null | undefined): Hex6 {
  const lch = hexToOklch(hex ?? "");
  if (!lch) return HARMONY.fallback;
  if (lch.C < HARMONY.neutralC) return oklchToHex(HARMONY.graphite);
  // Map the source lightness into the band instead of flattening, so tones keep a hint of their weight.
  let L = HARMONY.minL + clamp(lch.L, 0, 1) * (HARMONY.maxL - HARMONY.minL);
  const C = clamp(lch.C, HARMONY.minC, HARMONY.maxC);
  let out = oklchToHex({ L, C, h: lch.h });
  for (let i = 0; i < 20 && contrastRatio("#ffffff", out) < HARMONY.minWhiteContrast; i++) {
    L -= 0.01;
    out = oklchToHex({ L, C, h: lch.h });
  }
  return out;
}

/**
 * Tile colour from the whole profile palette: a clearly coloured canvas leads the
 * hue (so two members with the same accent still get different tiles); a neutral,
 * pale or black canvas hands the lead to the accent so the tile is never grey.
 */
export function harmonizeProfileBackground(profileBg: string | null | undefined, accent: string | null | undefined): Hex6 {
  const p = hexToOklch(profileBg ?? "");
  const a = hexToOklch(accent ?? "");
  if (!p) return harmonizeBackground(accent);
  if (!a || p.C >= HARMONY.leadC) return harmonizeBackground(profileBg);
  return harmonizeBackground(accent);
}

/** Lighter / darker sibling of a tile colour (same hue), for depth in the artwork. */
export function shadeTile(hex: string, dL: number, cScale = 1): Hex6 {
  const lch = hexToOklch(hex);
  if (!lch) return HARMONY.fallback;
  return oklchToHex({ L: clamp(lch.L + dL, 0, 1), C: Math.min(0.3, lch.C * cScale), h: lch.h });
}

/** Ambient glow tone behind the crest, same hue family as the background. */
export function harmonizeGlow(hex: string | null | undefined): Hex6 {
  const lch = hexToOklch(hex ?? "");
  if (!lch || lch.C < HARMONY.neutralC) return "#d8bc7b"; // gold glow for neutral colours
  return oklchToHex({ L: HARMONY.glowL, C: Math.min(lch.C, HARMONY.glowC), h: lch.h });
}

/** WCAG relative luminance (0..1). */
export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex) ?? { r: 0, g: 0, b: 0 };
  return 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
}

export function contrastRatio(a: string, b: string): number {
  const [x, y] = [relativeLuminance(a), relativeLuminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

export const LOGO_TONES = { light: "#fff0c4", dark: "#2a2110" } as const;
export type LogoTone = keyof typeof LOGO_TONES;

/** Picks the crest variant with the higher contrast against the background. */
export function pickLogoTone(bg: string): LogoTone {
  return contrastRatio(LOGO_TONES.light, bg) >= contrastRatio(LOGO_TONES.dark, bg) ? "light" : "dark";
}
