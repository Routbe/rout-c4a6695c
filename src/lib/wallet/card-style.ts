/**
 * Local privacy-safe style check for card customization: runs in the browser,
 * sends nothing. Text on the card must reach WCAG AA contrast (4.5:1).
 */
export const MIN_TEXT_CONTRAST = 4.5;

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error("invalid colour");
  const n = parseInt(m[1]!, 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export type StyleVerdict = { ok: true; ratio: number } | { ok: false; ratio: number; reason: "contrast" | "invalid" };

export function validateCardStyle(text: string, background: string): StyleVerdict {
  try {
    const ratio = Math.round(contrastRatio(text, background) * 100) / 100;
    return ratio >= MIN_TEXT_CONTRAST ? { ok: true, ratio } : { ok: false, ratio, reason: "contrast" };
  } catch {
    return { ok: false, ratio: 0, reason: "invalid" };
  }
}
