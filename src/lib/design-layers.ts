/**
 * Layered Design Studio model. Stored as one JSON string in
 * `display_prefs.designLayers` and always passed through
 * `normalizeDesignLayers` — on the server before saving and in the renderer —
 * so unknown keys, bad colors and out-of-range numbers never reach the page.
 */
import type { CSSProperties } from "react";

export type BackgroundKind = "color" | "gradient" | "pattern" | "photo";
export type PatternKind = "dots" | "grid" | "diagonal" | "waves";
export type SectionId = "avatar" | "blocks" | "footer" | "fx" | "decorations";
export type DecorationKind = "emoji" | "circle" | "square" | "star" | "blob";
export type BlockShadow = "none" | "soft" | "hard" | "glow";

export type BackgroundLayer = {
  id: string;
  kind: BackgroundKind;
  visible: boolean;
  opacity: number; // 0–100
  color: string;
  color2: string; // gradient end / pattern ink
  angle: number; // gradient angle 0–360
  pattern: PatternKind;
  imageUrl: string;
  blur: number; // 0–20 px
};

export type Section = { id: SectionId; visible: boolean };
export const IDENTITY_PARTS = ["name", "handle", "location", "bio"] as const;
export type IdentityPart = typeof IDENTITY_PARTS[number];

export type BlockStyle = {
  width?: 1 | 2;
  height?: "auto" | "medium" | "tall";
  bg: string | null;
  text: string | null;
  radius: number | null; // 0–32 px
  shadow: BlockShadow;
};

export type Decoration = {
  id: string;
  kind: DecorationKind;
  visible: boolean;
  emoji: string;
  color: string;
  x: number; // 0–100 %
  y: number; // 0–100 %
  size: number; // 12–200 px
  rotation: number; // -180–180
  opacity: number; // 0–100
};

export type DesignLayers = {
  version: 1;
  backgrounds: BackgroundLayer[];
  sections: Section[];
  blockStyles: Record<string, BlockStyle>;
  decorations: Decoration[];
  identityOrder?: IdentityPart[];
  linkDisplay?: "rows" | "icons" | "both";
  /** Logo bar under the bio with more than 5 logos: wrap onto extra rows or scroll like the Explore strip. */
  iconBarMode?: "wrap" | "scroll";
};

export const SECTION_LABEL: Record<SectionId, string> = {
  avatar: "Avatar & naam",
  blocks: "Blokken",
  footer: "Footer",
  fx: "Effecten (FX)",
  decorations: "Decoraties",
};

export const DEFAULT_SECTIONS: Section[] = [
  { id: "avatar", visible: true },
  { id: "blocks", visible: true },
  { id: "footer", visible: true },
  { id: "fx", visible: true },
  { id: "decorations", visible: true },
];

export const MAX_BACKGROUNDS = 6;
export const MAX_DECORATIONS = 30;
export const MAX_BLOCK_STYLES = 100;

export const EMPTY_LAYERS: DesignLayers = {
  version: 1,
  backgrounds: [],
  sections: DEFAULT_SECTIONS,
  blockStyles: {},
  decorations: [],
};

const HEX = /^#[0-9a-f]{6}$/i;
const ID = /^[a-z0-9_.:-]{1,64}$/i;

const clamp = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.round(Math.min(max, Math.max(min, n)));
};
const hex = (v: unknown, fallback: string) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : fallback);
const hexOrNull = (v: unknown) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : null);
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;
const bool = (v: unknown, fallback = true) => (typeof v === "boolean" ? v : fallback);
const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Only https images; anything else becomes empty. */
export function safeImageUrl(v: unknown): string {
  if (typeof v !== "string" || v.length > 2000) return "";
  try {
    return new URL(v).protocol === "https:" ? v : "";
  } catch {
    return "";
  }
}

/** Single grapheme-ish emoji/symbol, max 8 UTF-16 units, no markup. */
function safeEmoji(v: unknown): string {
  if (typeof v !== "string") return "✨";
  const s = v.trim().slice(0, 8);
  return s && !/[<>"'&]/.test(s) ? s : "✨";
}

export function normalizeDesignLayers(raw: unknown): DesignLayers {
  let input: unknown = raw;
  if (typeof raw === "string") {
    try {
      input = JSON.parse(raw);
    } catch {
      return structuredClone(EMPTY_LAYERS);
    }
  }
  const r = rec(input);

  const backgrounds = (Array.isArray(r["backgrounds"]) ? r["backgrounds"] : [])
    .slice(0, MAX_BACKGROUNDS)
    .map((b, i): BackgroundLayer => {
      const o = rec(b);
      return {
        id: typeof o["id"] === "string" && ID.test(o["id"]) ? o["id"] : `bg${i}`,
        kind: oneOf(o["kind"], ["color", "gradient", "pattern", "photo"] as const, "color"),
        visible: bool(o["visible"]),
        opacity: clamp(o["opacity"], 0, 100, 100),
        color: hex(o["color"], "#f5efe6"),
        color2: hex(o["color2"], "#1f2937"),
        angle: clamp(o["angle"], 0, 360, 135),
        pattern: oneOf(o["pattern"], ["dots", "grid", "diagonal", "waves"] as const, "dots"),
        imageUrl: safeImageUrl(o["imageUrl"]),
        blur: clamp(o["blur"], 0, 20, 0),
      };
    });

  // Every section exactly once, in the stored order, missing ones appended.
  const seen = new Set<SectionId>();
  const sections: Section[] = [];
  for (const s of Array.isArray(r["sections"]) ? r["sections"] : []) {
    const o = rec(s);
    const id = o["id"] as SectionId;
    if (!(id in SECTION_LABEL) || seen.has(id)) continue;
    seen.add(id);
    sections.push({ id, visible: bool(o["visible"]) });
  }
  for (const d of DEFAULT_SECTIONS) if (!seen.has(d.id)) sections.push({ ...d });

  const blockStyles: Record<string, BlockStyle> = {};
  for (const [key, value] of Object.entries(rec(r["blockStyles"])).slice(0, MAX_BLOCK_STYLES)) {
    if (!ID.test(key)) continue;
    const o = rec(value);
    const radius = o["radius"] === null || o["radius"] === undefined ? null : clamp(o["radius"], 0, 32, 12);
    blockStyles[key] = {
      ...(o["width"] === 1 || o["width"] === 2 ? { width: o["width"] } : {}),
      ...(["auto", "medium", "tall"].includes(String(o["height"])) ? { height: o["height"] as "auto" | "medium" | "tall" } : {}),
      bg: hexOrNull(o["bg"]),
      text: hexOrNull(o["text"]),
      radius,
      shadow: oneOf(o["shadow"], ["none", "soft", "hard", "glow"] as const, "none"),
    };
  }

  const decorations = (Array.isArray(r["decorations"]) ? r["decorations"] : [])
    .slice(0, MAX_DECORATIONS)
    .map((d, i): Decoration => {
      const o = rec(d);
      return {
        id: typeof o["id"] === "string" && ID.test(o["id"]) ? o["id"] : `dec${i}`,
        kind: oneOf(o["kind"], ["emoji", "circle", "square", "star", "blob"] as const, "emoji"),
        visible: bool(o["visible"]),
        emoji: safeEmoji(o["emoji"]),
        color: hex(o["color"], "#f59e0b"),
        x: clamp(o["x"], 0, 100, 50),
        y: clamp(o["y"], 0, 100, 10),
        size: clamp(o["size"], 12, 200, 40),
        rotation: clamp(o["rotation"], -180, 180, 0),
        opacity: clamp(o["opacity"], 0, 100, 100),
      };
    });

  const identityOrder = [...new Set((Array.isArray(r["identityOrder"]) ? r["identityOrder"] : []).filter((v): v is IdentityPart => IDENTITY_PARTS.includes(v as IdentityPart)))];
  for (const part of IDENTITY_PARTS) if (!identityOrder.includes(part)) identityOrder.push(part);
  return { version: 1, backgrounds, sections, blockStyles, decorations,
    ...(identityOrder.some((part, i) => part !== IDENTITY_PARTS[i]) ? { identityOrder } : {}),
    ...(["rows", "icons", "both"].includes(String(r["linkDisplay"])) ? { linkDisplay: r["linkDisplay"] as "rows" | "icons" | "both" } : {}),
    ...(r["iconBarMode"] === "wrap" || r["iconBarMode"] === "scroll" ? { iconBarMode: r["iconBarMode"] } : {}),
  };
}

export const serializeDesignLayers = (l: DesignLayers) => JSON.stringify(normalizeDesignLayers(l));

/** True when nothing differs from the empty model (keeps old profiles untouched). */
export function isEmptyLayers(l: DesignLayers): boolean {
  return (
    l.backgrounds.length === 0 &&
    !l.identityOrder && !l.linkDisplay && !l.iconBarMode &&
    l.decorations.length === 0 &&
    Object.keys(l.blockStyles).length === 0 &&
    l.sections.every((s, i) => s.id === DEFAULT_SECTIONS[i]?.id && s.visible)
  );
}

/* ------------------------------------------------------------- rendering */

function patternImage(p: PatternKind, ink: string): string {
  const c = encodeURIComponent(ink);
  const svg: Record<PatternKind, string> = {
    dots: `<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'><circle cx='3' cy='3' r='1.6' fill='${c}'/></svg>`,
    grid: `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><path d='M24 0H0V24' fill='none' stroke='${c}' stroke-width='1'/></svg>`,
    diagonal: `<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16'><path d='M0 16L16 0' stroke='${c}' stroke-width='1.2'/></svg>`,
    waves: `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='12'><path d='M0 6q10-8 20 0t20 0' fill='none' stroke='${c}' stroke-width='1.2'/></svg>`,
  };
  return `url("data:image/svg+xml,${svg[p]}")`;
}

export function backgroundLayerStyle(b: BackgroundLayer): CSSProperties {
  const base: CSSProperties = { opacity: b.opacity / 100 };
  switch (b.kind) {
    case "color":
      return { ...base, backgroundColor: b.color };
    case "gradient":
      return { ...base, backgroundImage: `linear-gradient(${b.angle}deg, ${b.color}, ${b.color2})` };
    case "pattern":
      return { ...base, backgroundColor: "transparent", backgroundImage: patternImage(b.pattern, b.color2) };
    case "photo":
      return b.imageUrl
        ? {
            ...base,
            backgroundImage: `url("${b.imageUrl.replace(/"/g, "%22")}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: b.blur ? `blur(${b.blur}px)` : undefined,
            transform: b.blur ? "scale(1.05)" : undefined,
          }
        : { display: "none" };
  }
}

const SHADOW: Record<BlockShadow, string | undefined> = {
  none: undefined,
  soft: "0 6px 20px -8px rgba(0,0,0,0.35)",
  hard: "4px 4px 0 0 currentColor",
  glow: "0 0 22px -4px currentColor",
};

export function blockStyleOverride(s: BlockStyle | undefined): CSSProperties {
  if (!s) return {};
  return {
    ...(s.bg ? { background: s.bg } : {}),
    ...(s.text ? { color: s.text } : {}),
    ...(s.radius !== null ? { borderRadius: s.radius } : {}),
    ...(SHADOW[s.shadow] ? { boxShadow: SHADOW[s.shadow] } : {}),
  };
}

export const sectionOrder = (l: DesignLayers, id: SectionId) => l.sections.findIndex((s) => s.id === id);
export const sectionVisible = (l: DesignLayers, id: SectionId) =>
  l.sections.find((s) => s.id === id)?.visible ?? true;

export const identityOrderOf = (l: DesignLayers, id: IdentityPart) => (l.identityOrder ?? [...IDENTITY_PARTS]).indexOf(id);
export function profileHandleLabel(path: string): string {
  return `@${path.replace(/^\/+/, "").replace(/^@/, "")}`;
}

/* --------------------------------------------------------------- presets */

export const LAYER_PRESETS: { id: string; label: string; layers: Partial<DesignLayers> }[] = [
  {
    id: "sunset",
    label: "Zonsondergang",
    layers: {
      backgrounds: [
        { id: "p1", kind: "gradient", visible: true, opacity: 100, color: "#ff9a62", color2: "#7c3a5e", angle: 160, pattern: "dots", imageUrl: "", blur: 0 },
        { id: "p2", kind: "pattern", visible: true, opacity: 25, color: "#000000", color2: "#ffffff", angle: 0, pattern: "dots", imageUrl: "", blur: 0 },
      ],
      decorations: [
        { id: "d1", kind: "emoji", visible: true, emoji: "☀️", color: "#ffffff", x: 85, y: 6, size: 48, rotation: 0, opacity: 90 },
      ],
    },
  },
  {
    id: "paper",
    label: "Papier",
    layers: {
      backgrounds: [
        { id: "p1", kind: "color", visible: true, opacity: 100, color: "#f5efe6", color2: "#000000", angle: 0, pattern: "dots", imageUrl: "", blur: 0 },
        { id: "p2", kind: "pattern", visible: true, opacity: 30, color: "#000000", color2: "#8a7a66", angle: 0, pattern: "grid", imageUrl: "", blur: 0 },
      ],
    },
  },
  {
    id: "night",
    label: "Nacht",
    layers: {
      backgrounds: [
        { id: "p1", kind: "gradient", visible: true, opacity: 100, color: "#0b1220", color2: "#1e293b", angle: 180, pattern: "dots", imageUrl: "", blur: 0 },
      ],
      decorations: [
        { id: "d1", kind: "star", visible: true, emoji: "✨", color: "#fde68a", x: 12, y: 8, size: 18, rotation: 0, opacity: 80 },
        { id: "d2", kind: "star", visible: true, emoji: "✨", color: "#fde68a", x: 88, y: 18, size: 12, rotation: 20, opacity: 70 },
        { id: "d3", kind: "circle", visible: true, emoji: "✨", color: "#e2e8f0", x: 80, y: 5, size: 36, rotation: 0, opacity: 60 },
      ],
    },
  },
  {
    id: "clean",
    label: "Leeg",
    layers: { backgrounds: [], decorations: [], blockStyles: {} },
  },
];

export function applyPreset(current: DesignLayers, presetId: string): DesignLayers {
  const p = LAYER_PRESETS.find((x) => x.id === presetId);
  if (!p) return current;
  return normalizeDesignLayers({ ...current, ...p.layers });
}
