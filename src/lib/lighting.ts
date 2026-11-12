/** 3D depth-lighting settings for the QR studio, with crash-proof defaults. */

export type LightSource = "Top-Left" | "Top-Right" | "Bottom-Left" | "Bottom-Right" | "Top";

export interface LightingSettings {
  lightSource: LightSource;
  /** 0–10 depth offset of the shadow. */
  elevation: number;
  /** 0–10 strength of the shadow. */
  intensity: number;
}

export const LIGHTING_DEFAULTS: LightingSettings = {
  lightSource: "Top-Left",
  elevation: 4,
  intensity: 4,
};

const SOURCES: LightSource[] = ["Top-Left", "Top-Right", "Bottom-Left", "Bottom-Right", "Top"];

const clamp = (n: unknown, fallback: number) =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(10, Math.max(0, n)) : fallback;

/** Never returns undefined fields, so render code can read them safely. */
export function resolveLighting(input?: Partial<LightingSettings> | null): LightingSettings {
  const source = input?.lightSource;
  return {
    lightSource: source && SOURCES.includes(source) ? source : LIGHTING_DEFAULTS.lightSource,
    elevation: clamp(input?.elevation, LIGHTING_DEFAULTS.elevation),
    intensity: clamp(input?.intensity, LIGHTING_DEFAULTS.intensity),
  };
}

/** CSS drop-shadow for the resolved lighting configuration. */
export function lightingShadow(input?: Partial<LightingSettings> | null): string {
  const { lightSource, elevation, intensity } = resolveLighting(input);
  const dx = lightSource.includes("Left")
    ? elevation
    : lightSource.includes("Right")
      ? -elevation
      : 0;
  const dy = lightSource.startsWith("Top") ? elevation : -elevation;
  const alpha = Math.min(0.5, intensity / 20);
  return `${dx}px ${dy}px ${Math.max(1, elevation)}px rgba(0,0,0,${alpha.toFixed(2)})`;
}
