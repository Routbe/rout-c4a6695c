/**
 * WCAG 2.1 contrast engine.
 *
 * Pure maths (sRGB relative luminance) so it can run on every colour change
 * without touching the DOM, plus an "auto-fix" solver that nudges luminance
 * until a colour pair clears the AA threshold while keeping the hue intact.
 */

export type WcagLevel = "AAA" | "AA" | "fail";

export interface ContrastResult {
  ratio: number;
  level: WcagLevel;
  /** Ratio rounded for display, e.g. "12.4". */
  display: string;
  /** True when export should be gated (critically low). */
  critical: boolean;
}

const HEX_RE = /^#?([a-f\d]{3}|[a-f\d]{6})$/i;

export type RGB = [number, number, number];

export function toRgb(input: string): RGB {
  const value = (input || "").trim();
  if (!value || value === "transparent") return [255, 255, 255];
  const m = HEX_RE.exec(value);
  if (!m) return [255, 255, 255];
  let hex = m[1];
  if (hex.length === 3)
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

export const toHex = ([r, g, b]: RGB): string =>
  `#${[r, g, b]
    .map((c) =>
      Math.max(0, Math.min(255, Math.round(c)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase()}`;

/** Official sRGB relative luminance (WCAG 2.1 §Relative luminance). */
export function relativeLuminance(rgb: RGB): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(fg: string, bg: string): number {
  try {
    const la = relativeLuminance(toRgb(fg));
    const lb = relativeLuminance(toRgb(bg));
    const [hi, lo] = la > lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
  } catch {
    return 21;
  }
}

export function evaluateContrast(fg: string, bg: string): ContrastResult {
  const ratio = contrastRatio(fg, bg);
  const level: WcagLevel = ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : "fail";
  return {
    ratio,
    level,
    display: ratio.toFixed(1),
    critical: ratio <= 2.5,
  };
}

/** Ratio below which a camera realistically fails to decode. */
export const FAIL_THRESHOLD = 3;
export const AA_TARGET = 4.5;

/* ── HSL helpers: adjusting lightness preserves the chosen hue ───────────── */

type HSL = { h: number; s: number; l: number };

function rgbToHsl([r, g, b]: RGB): HSL {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6;
  else if (max === gg) h = ((bb - rr) / d + 2) / 6;
  else h = ((rr - gg) / d + 4) / 6;
  return { h, s, l };
}

function hue2rgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToRgb({ h, s, l }: HSL): RGB {
  if (s === 0) {
    const v = l * 255;
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3) * 255, hue2rgb(p, q, h) * 255, hue2rgb(p, q, h - 1 / 3) * 255];
}

/** Shift a colour's lightness while keeping hue + saturation. */
function withLightness(color: string, l: number): string {
  const hsl = rgbToHsl(toRgb(color));
  return toHex(hslToRgb({ ...hsl, l: Math.max(0, Math.min(1, l)) }));
}

export interface AutoFixResult {
  fgColor: string;
  bgColor: string;
  ratio: number;
  changed: "foreground" | "background" | "none";
}

/**
 * Nudge the pair until it reaches the AA target (4.5:1) with the smallest
 * possible perceptual move: darken the dots on a light field, lighten the
 * field behind dark dots. Hue and saturation are preserved.
 */
export function autoFixContrast(
  fgColor: string,
  bgColor: string,
  target = AA_TARGET,
): AutoFixResult {
  try {
    if (contrastRatio(fgColor, bgColor) >= target) {
      return { fgColor, bgColor, ratio: contrastRatio(fgColor, bgColor), changed: "none" };
    }

    const bgIsTransparent = !bgColor || bgColor === "transparent";
    const effectiveBg = bgIsTransparent ? "#FFFFFF" : bgColor;
    const fgL = relativeLuminance(toRgb(fgColor));
    const bgL = relativeLuminance(toRgb(effectiveBg));

    // Prefer moving the dots (foreground): it is the element the user is least
    // likely to have picked for brand reasons on a printed sheet.
    const darkenForeground = fgL < bgL || bgIsTransparent;

    const start = rgbToHsl(toRgb(darkenForeground ? fgColor : effectiveBg)).l;
    const step = 0.02;
    for (let i = 1; i <= 50; i += 1) {
      const l = darkenForeground ? start - i * step : start + i * step;
      if (l < 0 || l > 1) break;
      const candidate = withLightness(darkenForeground ? fgColor : effectiveBg, l);
      const ratio = darkenForeground
        ? contrastRatio(candidate, effectiveBg)
        : contrastRatio(fgColor, candidate);
      if (ratio >= target) {
        return darkenForeground
          ? { fgColor: candidate, bgColor, ratio, changed: "foreground" }
          : { fgColor, bgColor: candidate, ratio, changed: "background" };
      }
    }

    // Last resort: pure ink on the existing field (or on white).
    const fallbackFg = bgL > 0.4 ? "#000000" : "#FFFFFF";
    return {
      fgColor: fallbackFg,
      bgColor,
      ratio: contrastRatio(fallbackFg, effectiveBg),
      changed: "foreground",
    };
  } catch {
    return { fgColor, bgColor, ratio: contrastRatio(fgColor, bgColor), changed: "none" };
  }
}
