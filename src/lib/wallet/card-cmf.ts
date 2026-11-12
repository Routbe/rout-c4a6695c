/**
 * CMF (colour, material, finish) engine for the ROUT Card. Pure data: the
 * same JSON drives the WebGL shader and is the print/CNC blueprint later.
 * Materials are age-gated: minors only get the holographic tier.
 */
import { contrastRatio, MIN_TEXT_CONTRAST } from "./card-style";
import { FACE_LAYOUT } from "./card-layout";

export type ShaderFinish = "metal" | "glass" | "holo";
export type AgeTier = "minor" | "sovereign";

export type CardMaterial = {
  id: string;
  name: string;
  tiers: AgeTier[];
  finish: ShaderFinish;
  baseHex: string;
  metalness: number;
  roughness: number;
  clearcoat: number;
  transmission: number;
  thickness: number;
  anisotropy: number;
  /** Lively junior pattern on the printed face. */
  junior?: boolean;
};

export const CARD_MATERIALS: readonly CardMaterial[] = [
  { id: "obsidian-titanium", name: "Obsidian Titanium", tiers: ["sovereign"], finish: "metal", baseHex: "#2b2d31", metalness: 0.92, roughness: 0.45, clearcoat: 0, transmission: 0, thickness: 0, anisotropy: 0.15 },
  { id: "frosted-alpine-glass", name: "Frosted Alpine Glass", tiers: ["sovereign"], finish: "glass", baseHex: "#dce6ec", metalness: 0, roughness: 0.2, clearcoat: 0.4, transmission: 1, thickness: 0.8, anisotropy: 0 },
  { id: "emerald-ceramic", name: "Emerald Ceramic", tiers: ["sovereign"], finish: "glass", baseHex: "#0f3d2e", metalness: 0, roughness: 0.1, clearcoat: 1, transmission: 0, thickness: 0, anisotropy: 0 },
  { id: "brushed-sovereign-silver", name: "Brushed Sovereign Silver", tiers: ["sovereign"], finish: "metal", baseHex: "#a9adb4", metalness: 1, roughness: 0.3, clearcoat: 0, transmission: 0, thickness: 0, anisotropy: 0.85 },
  { id: "prism-hologram", name: "Prism Hologram", tiers: ["minor", "sovereign"], finish: "holo", baseHex: "#1d2b4a", metalness: 0.5, roughness: 0.2, clearcoat: 0.6, transmission: 0, thickness: 0, anisotropy: 0.3 },
  { id: "junior-aurora", name: "Junior Aurora", tiers: ["minor"], finish: "holo", baseHex: "#16324f", metalness: 0.35, roughness: 0.25, clearcoat: 0.8, transmission: 0, thickness: 0, anisotropy: 0.2, junior: true },
] as const;

export function materialsFor(tier: AgeTier): CardMaterial[] {
  return CARD_MATERIALS.filter((m) => m.tiers.includes(tier));
}

export function defaultMaterial(tier: AgeTier): CardMaterial {
  return materialsFor(tier)[0]!;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Nearest readable tint: keeps the hue and moves the colour toward white or
 * black in 1 % steps until it reaches 4.5:1 against the material base.
 */
export function nearestSafeAccent(accent: string, base: string): string {
  if (contrastRatio(accent, base) >= MIN_TEXT_CONTRAST) return accent.toLowerCase();
  const rgb = hexToRgb(accent);
  for (let step = 1; step <= 100; step++) {
    const t = step / 100;
    const lighter = rgbToHex(rgb.map((c) => c + (255 - c) * t) as [number, number, number]);
    const darker = rgbToHex(rgb.map((c) => c * (1 - t)) as [number, number, number]);
    const okL = contrastRatio(lighter, base) >= MIN_TEXT_CONTRAST;
    const okD = contrastRatio(darker, base) >= MIN_TEXT_CONTRAST;
    if (okL && okD) return contrastRatio(lighter, base) >= contrastRatio(darker, base) ? lighter : darker;
    if (okL) return lighter;
    if (okD) return darker;
  }
  return contrastRatio("#ffffff", base) >= contrastRatio("#000000", base) ? "#ffffff" : "#000000";
}

export type CmfPayload = {
  version: 1;
  tier: AgeTier;
  material: Omit<CardMaterial, "tiers" | "name">;
  accentHex: string;
  contrast: number;
  text: {
    displayName: { value: string; x: number; y: number; sizeMm: number };
    region: { value: string; x: number; y: number; sizeMm: number };
  };
  /** Physical card size, ISO/IEC 7810 ID-1, in millimetres. */
  sizeMm: { w: 53.98; h: 85.6 };
};

export type CmfInput = { materialId: string; accentHex: string; displayName: string; region: string };

export type CmfResult = { ok: true; cmf: CmfPayload } | { ok: false; error: "material" | "contrast" | "accent" };

/** Builds the production JSON; refuses materials outside the tier and unreadable accents. */
export function buildCmf(input: CmfInput, tier: AgeTier): CmfResult {
  const m = CARD_MATERIALS.find((x) => x.id === input.materialId);
  if (!m || !m.tiers.includes(tier)) return { ok: false, error: "material" };
  if (!/^#[0-9a-f]{6}$/i.test(input.accentHex)) return { ok: false, error: "accent" };
  const contrast = Math.round(contrastRatio(input.accentHex, m.baseHex) * 100) / 100;
  if (contrast < MIN_TEXT_CONTRAST) return { ok: false, error: "contrast" };
  const { tiers: _t, name: _n, ...material } = m;
  return {
    ok: true,
    cmf: {
      version: 1,
      tier,
      material,
      accentHex: input.accentHex.toLowerCase(),
      contrast,
      text: {
        displayName: { value: input.displayName, ...FACE_LAYOUT.displayName },
        region: { value: input.region, ...FACE_LAYOUT.region },
      },
      sizeMm: { w: 53.98, h: 85.6 },
    },
  };
}
