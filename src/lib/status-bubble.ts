/** Pure rules for the Discord-style status bubble and advanced status dot. */
export const BUBBLE_POSITIONS = ["top-left", "top", "top-right", "left", "right", "bottom-left", "bottom", "bottom-right"] as const;
export type BubblePosition = (typeof BUBBLE_POSITIONS)[number];

export const BUBBLE_STYLES = [
  { id: "obsidian-flat", label: "Obsidian" },
  { id: "glassmorphism", label: "Glass" },
  { id: "bubble", label: "Bubble" },
  { id: "cartoon-outline", label: "Cartoon" },
  { id: "nature", label: "Natuur" },
  { id: "ornate", label: "Sierlijk" },
  { id: "techno", label: "Techno" },
  { id: "fire", label: "Vuur" },
  { id: "water", label: "Water" },
  { id: "earth", label: "Aarde" },
] as const;
export type BubbleStyle = (typeof BUBBLE_STYLES)[number]["id"];

export const BUBBLE_FONTS = [
  { id: "theme", label: "Thema", css: "inherit" },
  { id: "sans", label: "Sans", css: "ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'" },
  { id: "serif", label: "Serif", css: "ui-serif, Georgia, serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'" },
  { id: "mono", label: "Mono", css: "ui-monospace, SFMono-Regular, monospace, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'" },
  { id: "rounded", label: "Rond", css: "ui-rounded, 'Nunito', system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'" },
  { id: "hand", label: "Handschrift", css: "'Comic Sans MS', 'Chalkboard SE', cursive, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'" },
] as const;
export type BubbleFont = (typeof BUBBLE_FONTS)[number]["id"];

export const PRESENCE_INDICATORS = ["color", "color_with_icon", "emoji"] as const;
export type PresenceIndicator = (typeof PRESENCE_INDICATORS)[number];

const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : fallback;

export const normalizeBubblePosition = (v: unknown) => pick(v, BUBBLE_POSITIONS, "top-right");
export const normalizeBubbleStyle = (v: unknown) => pick(v, BUBBLE_STYLES.map((s) => s.id), "obsidian-flat");
export const normalizeBubbleFont = (v: unknown) => pick(v, BUBBLE_FONTS.map((f) => f.id), "theme");
export const normalizePresenceIndicator = (v: unknown) => pick(v, PRESENCE_INDICATORS, "color");

/** Exactly one native emoji (one grapheme with a pictograph or flag), else null. */
export function singleEmoji(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > 16) return null;
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment: (x: string) => Iterable<unknown> } }).Segmenter;
  const count = Seg ? [...new Seg(undefined, { granularity: "grapheme" }).segment(s)].length : Array.from(s).length;
  if (count !== 1) return null;
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(s) ? s : null;
}

/** Readable text colour (#111 or #fff) for a hex background. */
export function contrastText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#111111";
  const n = parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return lum > 0.4 ? "#111111" : "#ffffff";
}
