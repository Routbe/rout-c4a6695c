import { z } from "zod";

/**
 * JSON accepted in Studio drafts (blocks, display prefs). Nested objects and
 * arrays are allowed — display prefs hold qrSettings, designLayers and
 * themeOverrides — but depth, width and string size are bounded.
 * Root cause of "Niet opgeslagen": the old schema accepted only flat values,
 * so every nested pref was refused before the save ran.
 */
export const DRAFT_JSON_MAX_DEPTH = 8;
export const DRAFT_JSON_MAX_BYTES = 512 * 1024;
export const DRAFT_DATA_IMAGE_MAX = 200_000;

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/**
 * Canonical JSON boundary: the RPC transport keeps `undefined`, but the
 * database stores JSON. Apply JSON semantics before validating — `undefined`
 * keys disappear, `undefined`/non-finite array items become `null`, NaN and
 * Infinity become `null`. Root cause of the 422 on `displayPrefs.qrSettings`:
 * normalized QR styles carry optional keys set to `undefined`.
 */
export function toDraftJson(value: unknown): Json | undefined {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map((item) => toDraftJson(item) ?? null);
  if (typeof value === "object") {
    if (value instanceof Date) return value.toISOString();
    const out: Record<string, Json> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const json = toDraftJson(item);
      if (json !== undefined) out[key] = json;
    }
    return out;
  }
  return undefined;
}

function jsonAt(depth: number): z.ZodType<Json> {
  // Embedded QR logos (data:image base64) may be up to 200k chars, matching normalizeQrSettings;
  // all other strings stay at 20k. The total draft size cap still applies.
  const text = z.union([
    z.string().max(20_000),
    z.string().max(DRAFT_DATA_IMAGE_MAX).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),
  ]);
  const leaf = z.union([text, z.number().finite(), z.boolean(), z.null()]);
  if (depth >= DRAFT_JSON_MAX_DEPTH) return leaf;
  return z.lazy(() =>
    z.union([leaf, z.array(jsonAt(depth + 1)).max(200), z.record(z.string().max(200), jsonAt(depth + 1))]),
  ) as z.ZodType<Json>;
}

export const draftJsonRecordSchema = z.preprocess(
  toDraftJson,
  z
    .record(z.string().max(200), jsonAt(1))
    .refine((v) => JSON.stringify(v).length <= DRAFT_JSON_MAX_BYTES, { message: "validation: draft too large" }),
);
