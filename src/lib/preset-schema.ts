/**
 * Zero-trust ingestion layer for user-uploaded JSON preset files.
 *
 * Nothing from disk is trusted: the payload is size-capped, syntax-checked,
 * field-by-field type-checked against whitelists and numeric ranges, and any
 * unknown key is stripped before it can reach React state.
 */

import {
  DEFAULT_SNAPSHOT,
  PRESET_SCHEMA_VERSION,
  type QrStylePreset,
  type QrStyleSnapshot,
} from "./qr-presets";

/** Hard ceiling for an imported preset file (50 KB). */
export const MAX_PRESET_FILE_BYTES = 50 * 1024;
/** Never merge an absurd number of presets in one go. */
export const MAX_PRESETS_PER_FILE = 200;

export const ALLOWED_BODY_SHAPES = [
  "square",
  "dots",
  "rounded",
  "classy",
  "sharp",
  "calligraphy",
  "ballpoint",
  "chalk",
  "mesh",
] as const;

export const ALLOWED_DOT_STYLES = [
  "square",
  "dots",
  "rounded",
  "classy",
  "classy-rounded",
  "extra-rounded",
] as const;

export const ALLOWED_OUTER_CORNERS = ["square", "dot", "extra-rounded"] as const;
export const ALLOWED_INNER_CORNERS = ["square", "dot"] as const;
export const ALLOWED_FRAME_FONTS = ["sans", "serif", "mono", "display", "script"] as const;

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_COLOR =
  /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/i;
/** Gradients are re-rendered as CSS, so anything script-ish is rejected outright. */
const UNSAFE_CSS = /(url\(|expression\(|javascript:|@import|<|>|;|\{|\})/i;

export interface PresetIssue {
  /** Dotted path of the offending field, e.g. `presets[0].style.fgColor`. */
  path: string;
  message: string;
}

export type PresetImportResult =
  | { ok: true; presets: QrStylePreset[]; issues: PresetIssue[] }
  | { ok: false; presets: []; issues: PresetIssue[]; reason: string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function isSafeColor(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (v === "transparent") return true;
  return HEX_COLOR.test(v) || RGB_COLOR.test(v);
}

function safeGradient(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v || v.length > 2000) return null;
  if (UNSAFE_CSS.test(v)) return null;
  if (!/gradient\(/i.test(v)) return null;
  return v;
}

function clampNumber(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

/** Strip control characters and cap the length of any free-text field. */
function safeText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return cleaned.slice(0, max);
}

/**
 * Validate one style snapshot. Missing or invalid fields fall back to the safe
 * default for that key only — the rest of a partially valid preset still applies.
 */
export function validateSnapshot(
  input: unknown,
  path: string,
  issues: PresetIssue[],
): QrStyleSnapshot {
  const out: QrStyleSnapshot = { ...DEFAULT_SNAPSHOT };
  if (!isRecord(input)) {
    issues.push({ path, message: "Style object is missing — safe defaults applied" });
    return out;
  }

  const enumField = <T extends string>(
    key: keyof QrStyleSnapshot,
    allowed: readonly T[],
  ): T | null => {
    const raw = input[key];
    if (raw === undefined) return null;
    if (typeof raw !== "string" || !(allowed as readonly string[]).includes(raw)) {
      issues.push({
        path: `${path}.${String(key)}`,
        message: `Invalid property type for ${String(key)} — value not in allowed list`,
      });
      return null;
    }
    return raw as T;
  };

  const colorField = (key: "fgColor" | "bgColor") => {
    const raw = input[key];
    if (raw === undefined) return;
    if (!isSafeColor(raw)) {
      issues.push({
        path: `${path}.${key}`,
        message: `Invalid colour value for ${key} — expected hex, rgb() or "transparent"`,
      });
      return;
    }
    out[key] = (raw as string).trim();
  };

  const numberField = (key: "logoSize" | "logoMargin", min: number, max: number) => {
    const raw = input[key];
    if (raw === undefined) return;
    const value = clampNumber(raw, min, max);
    if (value === null) {
      issues.push({
        path: `${path}.${key}`,
        message: `${key} is out of the safe range (${min}–${max})`,
      });
      return;
    }
    out[key] = value;
  };

  colorField("fgColor");
  colorField("bgColor");

  if (input.bgGradient !== undefined && input.bgGradient !== null) {
    const gradient = safeGradient(input.bgGradient);
    if (!gradient) {
      issues.push({
        path: `${path}.bgGradient`,
        message: "Unsafe or malformed gradient — removed",
      });
    }
    out.bgGradient = gradient;
  }

  out.bodyShape = enumField("bodyShape", ALLOWED_BODY_SHAPES) ?? DEFAULT_SNAPSHOT.bodyShape;
  out.dotStyle = enumField("dotStyle", ALLOWED_DOT_STYLES) ?? DEFAULT_SNAPSHOT.dotStyle;
  out.outerCornerStyle =
    enumField("outerCornerStyle", ALLOWED_OUTER_CORNERS) ?? DEFAULT_SNAPSHOT.outerCornerStyle;
  out.innerCornerStyle =
    enumField("innerCornerStyle", ALLOWED_INNER_CORNERS) ?? DEFAULT_SNAPSHOT.innerCornerStyle;
  out.frameFont = enumField("frameFont", ALLOWED_FRAME_FONTS) ?? DEFAULT_SNAPSHOT.frameFont;

  numberField("logoSize", 0, 0.6);
  numberField("logoMargin", 0, 100);

  if (input.hideBackgroundDots !== undefined) {
    if (typeof input.hideBackgroundDots !== "boolean") {
      issues.push({
        path: `${path}.hideBackgroundDots`,
        message: "hideBackgroundDots must be true or false",
      });
    } else {
      out.hideBackgroundDots = input.hideBackgroundDots;
    }
  }

  if (input.frameId !== undefined && input.frameId !== null) {
    const id = safeText(input.frameId, 60);
    out.frameId = id && /^[a-z0-9-_]+$/i.test(id) ? id : null;
    if (!out.frameId)
      issues.push({ path: `${path}.frameId`, message: "Unknown frame id — cleared" });
  }

  if (input.frameLabel !== undefined) {
    out.frameLabel = safeText(input.frameLabel, 60) ?? "";
  }

  return out;
}

function validatePreset(
  input: unknown,
  index: number,
  issues: PresetIssue[],
): QrStylePreset | null {
  const path = `presets[${index}]`;
  if (!isRecord(input)) {
    issues.push({ path, message: "Entry is not a preset object — skipped" });
    return null;
  }
  const name = safeText(input.name, 40);
  if (!name) {
    issues.push({ path: `${path}.name`, message: "Preset name is missing or empty — skipped" });
    return null;
  }
  const rawId = safeText(input.id, 64);
  return {
    // Only whitelisted keys survive — nothing else can pollute app state.
    id:
      rawId && /^[a-z0-9-_]+$/i.test(rawId)
        ? rawId
        : `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    version: PRESET_SCHEMA_VERSION,
    factory: false,
    style: validateSnapshot(input.style, `${path}.style`, issues),
  };
}

/** Byte length of a UTF-8 string without allocating a Blob. */
export function utf8Bytes(text: string): number {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
  return unescape(encodeURIComponent(text)).length;
}

/**
 * Full ingestion pipeline for a preset file. Never throws; a failure always
 * comes back as `ok: false` with a human-readable reason for the error toast.
 */
export function ingestPresetFile(raw: string): PresetImportResult {
  const issues: PresetIssue[] = [];

  const bytes = utf8Bytes(raw);
  if (bytes === 0) {
    return { ok: false, presets: [], issues, reason: "Het bestand is leeg." };
  }
  if (bytes > MAX_PRESET_FILE_BYTES) {
    return {
      ok: false,
      presets: [],
      issues,
      reason: `Bestand overschrijdt de maximale grootte (${Math.round(bytes / 1024)} KB van max ${MAX_PRESET_FILE_BYTES / 1024} KB).`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, presets: [], issues, reason: "Ongeldige JSON-syntax." };
  }

  const list = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.presets)
      ? parsed.presets
      : null;

  if (!list) {
    return {
      ok: false,
      presets: [],
      issues,
      reason: "Onverwachte structuur — er is geen 'presets' array gevonden.",
    };
  }
  if (list.length > MAX_PRESETS_PER_FILE) {
    return {
      ok: false,
      presets: [],
      issues,
      reason: `Te veel presets in één bestand (max ${MAX_PRESETS_PER_FILE}).`,
    };
  }

  const presets = list
    .map((entry, i) => validatePreset(entry, i, issues))
    .filter((p): p is QrStylePreset => p !== null);

  if (!presets.length) {
    return {
      ok: false,
      presets: [],
      issues,
      reason: issues[0]?.message ?? "Dit bestand bevat geen geldige stijlen.",
    };
  }

  return { ok: true, presets, issues };
}
