/**
 * Scoped theme engine for public Profile Hubs (pure, browser-safe).
 *
 * Global glass tokens live on the design prefs (`glass*` fields = theme.global);
 * a component scope may override them in `themeOverrides[scope]`. Rendering
 * merges global + override and turns the result into inline CSS.
 */

export const THEME_SCOPES = ["all", "links", "widgets", "booking", "board", "presence", "socials", "questions", "answers"] as const;
export type ThemeScope = (typeof THEME_SCOPES)[number];
export type ComponentScope = Exclude<ThemeScope, "all">;
export const COMPONENT_SCOPES: ComponentScope[] = ["links", "widgets", "booking", "board", "presence", "socials", "questions", "answers"];

export const GLASS_STYLES = ["solid", "frosted-light", "frosted-dark", "obsidian", "prism", "neon"] as const;
export type GlassStyle = (typeof GLASS_STYLES)[number];
export const GLASS_BORDERS = ["subtle", "bright", "off"] as const;
export type GlassBorder = (typeof GLASS_BORDERS)[number];

export type GlassTokens = {
  glassStyle: GlassStyle;
  /** Glass opacity in percent, 5–50. */
  glassOpacity: number;
  /** Blur radius in px, 4–32. */
  glassBlur: number;
  glassBorder: GlassBorder;
  /** Backdrop saturation in percent, 100–200. */
  glassSaturation: number;
  /** Liquid lens refraction at the rim, 0–100 (Chromium; others keep blur only). */
  glassRefraction: number;
  /** Prismatic RGB split at the rim, 0–50 (= 0.0–5.0). */
  glassAberration: number;
  /** Specular rim + pointer highlight strength, 0–100. */
  glassSpecular: number;
};

export type GlassTargets = Record<"links" | "presence" | "board" | "booking", boolean>;

/** Button/typography keys a component may override (same values as the global design prefs). */
export const OVERRIDE_BUTTON_VARIANTS = ["fill", "outline", "glass", "hard", "soft", "gradient", "neon", "ghost"] as const;
export const OVERRIDE_BUTTON_RADII = ["pill", "xl", "rounded", "soft", "sharp"] as const;
export const OVERRIDE_FONT_PAIRINGS = ["modern", "serif", "mono", "display", "editorial", "geometric", "brutal", "luxe", "handwritten", "futuristic", "classic", "condensed"] as const;
export type ButtonTokens = {
  buttonVariant: (typeof OVERRIDE_BUTTON_VARIANTS)[number];
  buttonRadius: (typeof OVERRIDE_BUTTON_RADII)[number];
  fontPairing: (typeof OVERRIDE_FONT_PAIRINGS)[number];
  buttonColor: string | null;
  buttonTextColor: string | null;
  /** Optional button outline colour; null = the variant's own border. */
  buttonBorderColor: string | null;
};
export const BUTTON_TOKEN_KEYS = ["buttonVariant", "buttonRadius", "fontPairing", "buttonColor", "buttonTextColor", "buttonBorderColor"] as const;

/** Shape presets: one click sets both button style and corner radius. */
export const BUTTON_SHAPE_PRESETS: readonly {
  id: string;
  label: string;
  buttonVariant: ButtonTokens["buttonVariant"];
  buttonRadius: ButtonTokens["buttonRadius"];
}[] = [
  { id: "bordered", label: "Bordered", buttonVariant: "outline", buttonRadius: "rounded" },
  { id: "flat", label: "Solid Flat", buttonVariant: "fill", buttonRadius: "soft" },
  { id: "pill", label: "Pill", buttonVariant: "fill", buttonRadius: "pill" },
  { id: "sharp", label: "Sharp", buttonVariant: "fill", buttonRadius: "sharp" },
  { id: "glass", label: "Glass", buttonVariant: "glass", buttonRadius: "xl" },
  { id: "neon", label: "Neon Glow", buttonVariant: "neon", buttonRadius: "rounded" },
];

export type ScopeOverride = Partial<GlassTokens> & Partial<ButtonTokens>;
export type ThemeOverrides = Partial<Record<ComponentScope, ScopeOverride>>;

export const DEFAULT_GLASS: GlassTokens = {
  glassStyle: "solid",
  glassOpacity: 12,
  glassBlur: 16,
  glassBorder: "subtle",
  glassSaturation: 180,
  glassRefraction: 40,
  glassAberration: 20,
  glassSpecular: 60,
};
export const DEFAULT_GLASS_TARGETS: GlassTargets = { links: true, presence: true, board: true, booking: true };

const clamp = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

export function normalizeGlassTokens(r: Record<string, unknown>): GlassTokens {
  return {
    glassStyle: pick(r["glassStyle"], GLASS_STYLES, DEFAULT_GLASS.glassStyle),
    glassOpacity: clamp(r["glassOpacity"], 5, 50, DEFAULT_GLASS.glassOpacity),
    glassBlur: clamp(r["glassBlur"], 4, 32, DEFAULT_GLASS.glassBlur),
    glassBorder: pick(r["glassBorder"], GLASS_BORDERS, DEFAULT_GLASS.glassBorder),
    glassSaturation: clamp(r["glassSaturation"], 100, 200, DEFAULT_GLASS.glassSaturation),
    glassRefraction: clamp(r["glassRefraction"], 0, 100, DEFAULT_GLASS.glassRefraction),
    glassAberration: clamp(r["glassAberration"], 0, 50, DEFAULT_GLASS.glassAberration),
    glassSpecular: clamp(r["glassSpecular"], 0, 100, DEFAULT_GLASS.glassSpecular),
  };
}

/** Keeps only valid keys; an override never stores a key equal to nothing. */
const HEX = /^#[0-9a-f]{6}$/i;
const isIn = (list: readonly string[], v: unknown): v is string => typeof v === "string" && list.includes(v);
function normalizePartial(raw: unknown): ScopeOverride {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: ScopeOverride = {};
  if (isIn(OVERRIDE_BUTTON_VARIANTS, r["buttonVariant"])) out.buttonVariant = r["buttonVariant"] as ButtonTokens["buttonVariant"];
  if (isIn(OVERRIDE_BUTTON_RADII, r["buttonRadius"])) out.buttonRadius = r["buttonRadius"] as ButtonTokens["buttonRadius"];
  if (isIn(OVERRIDE_FONT_PAIRINGS, r["fontPairing"])) out.fontPairing = r["fontPairing"] as ButtonTokens["fontPairing"];
  if (typeof r["buttonColor"] === "string" && HEX.test(r["buttonColor"])) out.buttonColor = r["buttonColor"];
  if (typeof r["buttonTextColor"] === "string" && HEX.test(r["buttonTextColor"])) out.buttonTextColor = r["buttonTextColor"];
  if (typeof r["buttonBorderColor"] === "string" && HEX.test(r["buttonBorderColor"])) out.buttonBorderColor = r["buttonBorderColor"];
  if (GLASS_STYLES.includes(r["glassStyle"] as GlassStyle)) out.glassStyle = r["glassStyle"] as GlassStyle;
  if (r["glassOpacity"] !== undefined) out.glassOpacity = clamp(r["glassOpacity"], 5, 50, DEFAULT_GLASS.glassOpacity);
  if (r["glassBlur"] !== undefined) out.glassBlur = clamp(r["glassBlur"], 4, 32, DEFAULT_GLASS.glassBlur);
  if (GLASS_BORDERS.includes(r["glassBorder"] as GlassBorder)) out.glassBorder = r["glassBorder"] as GlassBorder;
  if (r["glassSaturation"] !== undefined) out.glassSaturation = clamp(r["glassSaturation"], 100, 200, DEFAULT_GLASS.glassSaturation);
  if (r["glassRefraction"] !== undefined) out.glassRefraction = clamp(r["glassRefraction"], 0, 100, DEFAULT_GLASS.glassRefraction);
  if (r["glassAberration"] !== undefined) out.glassAberration = clamp(r["glassAberration"], 0, 50, DEFAULT_GLASS.glassAberration);
  if (r["glassSpecular"] !== undefined) out.glassSpecular = clamp(r["glassSpecular"], 0, 100, DEFAULT_GLASS.glassSpecular);
  return out;
}

export function normalizeThemeOverrides(raw: unknown): ThemeOverrides {
  if (!raw || typeof raw !== "object") return {};
  const out: ThemeOverrides = {};
  for (const scope of COMPONENT_SCOPES) {
    const o = normalizePartial((raw as Record<string, unknown>)[scope]);
    if (Object.keys(o).length) out[scope] = o;
  }
  return out;
}

export function normalizeGlassTargets(raw: unknown): GlassTargets {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    links: r["links"] === undefined ? true : Boolean(r["links"]),
    presence: r["presence"] === undefined ? true : Boolean(r["presence"]),
    board: r["board"] === undefined ? true : Boolean(r["board"]),
    booking: r["booking"] === undefined ? true : Boolean(r["booking"]),
  };
}

/** Global tokens merged with the scope's override ("all" = global only). */
export function resolveScopedTokens(global: GlassTokens, overrides: ThemeOverrides, scope: ThemeScope): GlassTokens {
  const widgetScope = ["widgets", "booking", "board", "presence", "questions", "answers"].includes(scope);
  return scope === "all" ? global : { ...global, ...(widgetScope ? overrides.widgets : {}), ...(overrides[scope] ?? {}) };
}

/**
 * Full cascade for one component: `{ ...global, ...(overrides[scope] ?? {}) }`
 * over every key (glass, button style/radius, typography, colours).
 * `hasButtonOverride` tells the renderer to apply button keys even when the
 * global custom-button switch is off.
 */
export function resolveComponentDesign<T extends object>(
  global: T,
  overrides: ThemeOverrides,
  scope: ThemeScope,
): T & ScopeOverride & { hasButtonOverride: boolean } {
  const widgetScope = ["widgets", "booking", "board", "presence", "questions", "answers"].includes(scope);
  const o = scope === "all" ? undefined : { ...(widgetScope ? overrides.widgets : {}), ...overrides[scope] };
  const hasButtonOverride = !!o && BUTTON_TOKEN_KEYS.some((k) => o[k] !== undefined);
  const result = { ...global, ...(o ?? {}), hasButtonOverride };
  if (widgetScope && "buttonRadius" in result && result.buttonRadius === "pill") return { ...result, buttonRadius: "rounded" };
  return result;
}

/** Effective style for one component type: its override merged over the global defaults. */
export function getEffectiveComponentStyle(
  theme: { global: GlassTokens; overrides: ThemeOverrides },
  componentType: ThemeScope,
): GlassTokens {
  return resolveScopedTokens(theme.global, theme.overrides, componentType);
}

/** True when a component scope deviates from the global style. */
export function hasUniqueStyle(
  global: Partial<GlassTokens> & Partial<Record<keyof ButtonTokens, unknown>>,
  overrides: ThemeOverrides,
  scope: ThemeScope,
): boolean {
  if (scope === "all") return false;
  const o = overrides[scope];
  if (!o) return false;
  return (Object.keys(o) as (keyof ScopeOverride)[]).some((k) => o[k] !== global[k]);
}

/** Writes a patch to the global tokens or to one scope's override. */
export function applyScopedPatch(
  global: GlassTokens,
  overrides: ThemeOverrides,
  scope: ThemeScope,
  patch: ScopeOverride,
): { global: GlassTokens; overrides: ThemeOverrides } {
  if (scope === "all") return { global: { ...global, ...patch }, overrides };
  const merged: Record<string, unknown> = { ...(overrides[scope] ?? {}), ...patch };
  // A cleared value (null) means "follow the default" and is not stored as an override.
  for (const key of Object.keys(merged)) if (merged[key] === null) delete merged[key];
  return { global, overrides: { ...overrides, [scope]: merged as ScopeOverride } };
}

export function resetScope(overrides: ThemeOverrides, scope: ComponentScope): ThemeOverrides {
  const next = { ...overrides };
  delete next[scope];
  return next;
}

/** Which glass target checkbox governs a scope (socials follow links). */
function targetOf(scope: ComponentScope): keyof GlassTargets {
  if (scope === "questions" || scope === "answers" || scope === "widgets") return "board";
  return scope === "socials" ? "links" : scope;
}

/** Shared easing for every glass change (preset switch, slider drag). */
export const GLASS_TRANSITION = "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)";

/**
 * SVG filter id for the liquid lens; the matching <filter> is rendered by
 * `LiquidGlassFilters`. Values are quantised so sliders reuse a few filters.
 */
export function liquidFilterId(t: Pick<GlassTokens, "glassRefraction" | "glassAberration">): string | null {
  const r = Math.round(t.glassRefraction / 5) * 5;
  const a = Math.round(t.glassAberration / 5) * 5;
  return r === 0 && a === 0 ? null : `rout-lg-r${r}-a${a}`;
}

/**
 * Inline CSS for a glass surface, or null for solid / disabled targets.
 * Apple recipe: blur + saturate backdrop, a hairline specular edge and a soft
 * diffuse shadow. The liquid lens (SVG refraction + RGB split) travels in the
 * `--lg-filter` custom property and is only promoted to `backdrop-filter` by
 * styles.css on engines that render SVG backdrop filters (html[data-liquid]);
 * every other browser keeps the plain blur, never a broken filter.
 */
export function glassSurfaceStyle(
  tokens: GlassTokens,
  scope: ComponentScope,
  targets: GlassTargets,
): Record<string, string> | null {
  if (tokens.glassStyle === "solid" || !targets[targetOf(scope)]) return null;
  const a = tokens.glassOpacity / 100;
  const spec = tokens.glassSpecular / 100;
  const style = tokens.glassStyle;
  const dark = style === "frosted-dark" || style === "obsidian";
  const bg = style === "obsidian"
    ? `rgba(8, 8, 12, ${Math.min(0.85, a + 0.35).toFixed(2)})`
    : style === "neon"
      ? `color-mix(in oklab, var(--primary) ${Math.round(Math.max(a, 0.15) * 100)}%, transparent)`
      : dark
        ? `rgba(15, 15, 15, ${Math.min(0.85, a + 0.38).toFixed(2)})`
        : `rgba(255, 255, 255, ${Math.min(0.5, a + 0.08).toFixed(2)})`;
  const edgeBase = tokens.glassBorder === "off" ? 0 : tokens.glassBorder === "bright" ? 0.55 : 0.4;
  const edge = dark ? edgeBase * 0.45 : edgeBase;
  const top = tokens.glassBorder === "off" ? 0 : Math.min(0.85, edgeBase + 0.2);
  const blur = `blur(${tokens.glassBlur}px) saturate(${tokens.glassSaturation}%)`;
  const lens = liquidFilterId(tokens);
  // Specular sheen follows the pointer (--lg-x/--lg-y set by useLiquidPointer).
  const sheen = `radial-gradient(120% 140% at var(--lg-x, 30%) var(--lg-y, -20%), rgba(255,255,255,${(spec * (dark ? 0.22 : 0.38)).toFixed(3)}), rgba(255,255,255,0) 55%)`;
  const css: Record<string, string> = {
    background: `${sheen}, ${bg}`,
    backdropFilter: blur,
    WebkitBackdropFilter: blur,
    border: edge ? `1px solid ${dark ? `rgba(0, 0, 0, ${(edge + 0.2).toFixed(2)})` : `rgba(255, 255, 255, ${edge.toFixed(2)})`}` : "1px solid transparent",
    borderTop: top ? `1px solid rgba(255, 255, 255, ${top.toFixed(2)})` : "1px solid transparent",
    boxShadow: [
      "0 8px 32px 0 rgba(0, 0, 0, 0.15)",
      `inset 0 1px 0 0 rgba(255, 255, 255, ${(spec * 0.7).toFixed(3)})`,
      `inset 0 -1px 0 0 rgba(255, 255, 255, ${(spec * 0.12).toFixed(3)})`,
      `inset 0 0 ${Math.round(6 + spec * 14)}px 0 rgba(255, 255, 255, ${(spec * (dark ? 0.06 : 0.14)).toFixed(3)})`,
    ].join(", "),
    transition: GLASS_TRANSITION,
    willChange: "transform",
  };
  if (lens) css["--lg-filter"] = `url(#${lens}) ${blur}`;
  if (style === "obsidian") {
    css["boxShadow"] = `0 10px 40px -8px rgba(0, 0, 0, 0.6), inset 0 1px 0 0 rgba(255, 255, 255, ${(0.1 + spec * 0.25).toFixed(3)}), inset 0 0 0 1px rgba(255, 255, 255, 0.06)`;
  }
  if (style === "neon") {
    css["boxShadow"] = `0 8px 32px -6px color-mix(in oklab, var(--primary) 45%, transparent), inset 0 1px 0 0 rgba(255, 255, 255, ${(spec * 0.6).toFixed(3)})`;
    css["border"] = "1px solid color-mix(in oklab, var(--primary) 55%, transparent)";
  }
  if (style === "prism") {
    css["border"] = "1px solid transparent";
    css["borderTop"] = "1px solid transparent";
    css["background"] =
      `${sheen} padding-box, linear-gradient(${bg}, ${bg}) padding-box, linear-gradient(135deg, rgba(255,120,200,.7), rgba(120,200,255,.7), rgba(180,255,160,.7)) border-box`;
  }
  return css;
}

/** Maps a profile block kind to the theme scope that styles it. */
export function scopeOfBlockKind(kind: string): ComponentScope {
  if (kind === "widget:questions") return "questions";
  if (kind === "booking_request" || kind === "booking") return "booking";
  if (kind === "live") return "presence";
  if (kind === "widget:guestbook" || kind === "live_poll" || kind === "contact_form" || kind === "faq_accordion") return "board";
  if (kind === "social_feed" || kind === "social") return "socials";
  if (["audio_player", "media_embed", "gallery", "countdown", "map", "event_list", "feedback", "newsletter", "poll"].includes(kind) || kind.startsWith("widget:")) return "widgets";
  return "links";
}
