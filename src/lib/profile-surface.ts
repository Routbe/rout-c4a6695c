import { contrastRatio, toHex, toRgb } from "./wcag";

type Theme = { bg: string; card: string; text: string; muted: string; border: string; accent?: string };
/** Derive all automatic surfaces from the selected canvas, not the old preset. */
export function profileSurface<T extends Theme>(theme: T, background?: string | null): T {
  if (!background || !/^#[\da-f]{3}([\da-f]{3})?$/i.test(background) || background.toLowerCase() === theme.bg.toLowerCase()) return theme;
  const bg = toRgb(background);
  const light = contrastRatio("#FFFFFF", background) > contrastRatio("#131211", background);
  const text = light ? "#FFFFFF" : "#131211";
  const fg = toRgb(text);
  const mix = (amount: number) => toHex(bg.map((v, i) => v + (fg[i] - v) * amount) as [number, number, number]);
  return { ...theme, bg: background, text, card: mix(.06), border: mix(.22), muted: mix(.72) };
}