/**
 * Elemental Typography Engine: pure style rules for the profile name.
 * Effects/entrances are CSS keyframes in styles.css (`.tt-fx-*`, `.tt-in-*`),
 * so the name stays real, selectable, accessible text.
 */
export type TitleEffect = "none" | "ice" | "fire" | "mist" | "volt";
export type TitleEntrance = "none" | "burn" | "dissolve";

export const TITLE_EFFECTS: { id: TitleEffect; label: string }[] = [
  { id: "none", label: "Standaard" },
  { id: "ice", label: "Gletsjer IJs" },
  { id: "fire", label: "Helse Vuur" },
  { id: "mist", label: "Fluister Mist" },
  { id: "volt", label: "Voltaïsche Elektriciteit" },
];
export const TITLE_ENTRANCES: { id: TitleEntrance; label: string }[] = [
  { id: "none", label: "Geen" },
  { id: "burn", label: "Thermal Burn" },
  { id: "dissolve", label: "Liquid Dissolve" },
];

export type TitleTypography = {
  titleColor: string | null;
  titleGradientTo: string | null;
  titleGlow: number;
  titleShadowBlur: number;
  titleShadowX: number;
  titleShadowY: number;
  titleShadowColor: string | null;
  titleEffect: TitleEffect;
  titleEntrance: TitleEntrance;
  titleReveal: number;
};

/** Inline style for the name span. Gradient wins over a plain colour; shadows stack (drop + glow). */
export function titleTypographyStyle(p: TitleTypography, fallbackText: string): Record<string, string> {
  const out: Record<string, string> = {};
  const from = p.titleColor ?? fallbackText;
  if (p.titleGradientTo) {
    out.backgroundImage = `linear-gradient(100deg, ${from}, ${p.titleGradientTo})`;
    out.backgroundClip = "text";
    out.WebkitBackgroundClip = "text";
    out.color = "transparent";
  } else if (p.titleColor) {
    out.color = p.titleColor;
  }
  const shadows: string[] = [];
  if (p.titleShadowBlur > 0 || p.titleShadowX !== 0 || p.titleShadowY !== 0) {
    shadows.push(`${p.titleShadowX}px ${p.titleShadowY}px ${p.titleShadowBlur}px ${p.titleShadowColor ?? "rgba(0,0,0,0.45)"}`);
  }
  if (p.titleGlow > 0) shadows.push(`0 0 ${p.titleGlow}px ${p.titleColor ?? "currentColor"}`);
  // Gradient text is transparent: text-shadow would paint over it, so use drop-shadow filters.
  if (shadows.length) {
    if (p.titleGradientTo) out.filter = shadows.map((s) => `drop-shadow(${s})`).join(" ");
    else out.textShadow = shadows.join(", ");
  }
  out["--tt-reveal"] = String(Math.max(0, Math.min(100, p.titleReveal)) / 100);
  return out;
}

/** Class names for the animated effect + entrance (empty when standard). */
export function titleTypographyClass(p: Pick<TitleTypography, "titleEffect" | "titleEntrance">): string {
  return [p.titleEffect !== "none" ? `tt-fx tt-fx-${p.titleEffect}` : "", p.titleEntrance !== "none" ? `tt-in-${p.titleEntrance}` : ""].filter(Boolean).join(" ");
}
