/**
 * QR style preset engine.
 *
 * Everything here is defensive: localStorage can be full, blocked, or hold
 * malformed JSON written by an older build, and none of that may ever reach
 * React as a thrown error.
 */

export const PRESET_STORAGE_KEY = "rout.qr.presets.v1";
export const PRESET_SCHEMA_VERSION = 1;

export interface QrStyleSnapshot {
  fgColor: string;
  bgColor: string;
  bgGradient: string | null;
  bodyShape: string;
  dotStyle: string;
  outerCornerStyle: string;
  innerCornerStyle: string;
  logoSize: number;
  logoMargin: number;
  hideBackgroundDots: boolean;
  frameId: string | null;
  frameLabel: string;
  frameFont: string;
  /** Print the short link as readable text under the QR. */
  captionEnabled: boolean;
  captionText: string;
}

export interface QrStylePreset {
  id: string;
  name: string;
  version: number;
  /** Factory presets ship with the app and cannot be deleted. */
  factory?: boolean;
  style: QrStyleSnapshot;
}

export const DEFAULT_SNAPSHOT: QrStyleSnapshot = {
  fgColor: "#1A1A1A",
  bgColor: "transparent",
  bgGradient: null,
  bodyShape: "square",
  dotStyle: "square",
  outerCornerStyle: "square",
  innerCornerStyle: "square",
  logoSize: 0.4,
  logoMargin: 10,
  hideBackgroundDots: true,
  frameId: null,
  frameLabel: "",
  frameFont: "sans",
  captionEnabled: false,
  captionText: "",
};

export const FACTORY_PRESETS: QrStylePreset[] = [
  {
    id: "factory-ink-on-paper",
    name: "Ink on Paper",
    version: PRESET_SCHEMA_VERSION,
    factory: true,
    style: {
      ...DEFAULT_SNAPSHOT,
      fgColor: "#1A1A1A",
      bgColor: "#FBF9F5",
      bodyShape: "classy",
      dotStyle: "classy",
      outerCornerStyle: "extra-rounded",
      innerCornerStyle: "dot",
    },
  },
  {
    id: "factory-midnight-monolith",
    name: "Midnight Monolith",
    version: PRESET_SCHEMA_VERSION,
    factory: true,
    style: {
      ...DEFAULT_SNAPSHOT,
      fgColor: "#F5F3EE",
      bgColor: "#101418",
      bodyShape: "square",
      dotStyle: "square",
      outerCornerStyle: "square",
      innerCornerStyle: "square",
    },
  },
  {
    id: "factory-neon-blueprint",
    name: "Neon Blueprint",
    version: PRESET_SCHEMA_VERSION,
    factory: true,
    style: {
      ...DEFAULT_SNAPSHOT,
      fgColor: "#0B2447",
      bgColor: "#D9F2FF",
      bodyShape: "dots",
      dotStyle: "dots",
      outerCornerStyle: "dot",
      innerCornerStyle: "dot",
    },
  },
];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Coerce any stored shape into a valid snapshot, field by field. */
export function normalizeSnapshot(input: unknown): QrStyleSnapshot {
  if (!isRecord(input)) return { ...DEFAULT_SNAPSHOT };
  const str = (k: keyof QrStyleSnapshot, fallback: string) =>
    typeof input[k] === "string" ? (input[k] as string) : fallback;
  const num = (k: keyof QrStyleSnapshot, fallback: number) =>
    typeof input[k] === "number" && Number.isFinite(input[k]) ? (input[k] as number) : fallback;
  return {
    fgColor: str("fgColor", DEFAULT_SNAPSHOT.fgColor),
    bgColor: str("bgColor", DEFAULT_SNAPSHOT.bgColor),
    bgGradient: typeof input.bgGradient === "string" ? input.bgGradient : null,
    bodyShape: str("bodyShape", DEFAULT_SNAPSHOT.bodyShape),
    dotStyle: str("dotStyle", DEFAULT_SNAPSHOT.dotStyle),
    outerCornerStyle: str("outerCornerStyle", DEFAULT_SNAPSHOT.outerCornerStyle),
    innerCornerStyle: str("innerCornerStyle", DEFAULT_SNAPSHOT.innerCornerStyle),
    logoSize: num("logoSize", DEFAULT_SNAPSHOT.logoSize),
    logoMargin: num("logoMargin", DEFAULT_SNAPSHOT.logoMargin),
    hideBackgroundDots:
      typeof input.hideBackgroundDots === "boolean"
        ? input.hideBackgroundDots
        : DEFAULT_SNAPSHOT.hideBackgroundDots,
    frameId: typeof input.frameId === "string" ? input.frameId : null,
    frameLabel: str("frameLabel", ""),
    frameFont: str("frameFont", "sans"),
    captionEnabled: input.captionEnabled === true,
    captionText: str("captionText", ""),
  };
}

function normalizePreset(input: unknown): QrStylePreset | null {
  if (!isRecord(input)) return null;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return null;
  return {
    id:
      typeof input.id === "string" && input.id
        ? input.id
        : `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.slice(0, 40),
    version: PRESET_SCHEMA_VERSION,
    factory: input.factory === true,
    style: normalizeSnapshot(input.style),
  };
}

function readRaw(): QrStylePreset[] | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(PRESET_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    // Version check: anything from an unknown schema is rebuilt from factory.
    const list = isRecord(parsed) && Array.isArray(parsed.presets) ? parsed.presets : null;
    const version = isRecord(parsed) && typeof parsed.version === "number" ? parsed.version : 0;
    if (!list || version !== PRESET_SCHEMA_VERSION) return null;
    const clean = list.map(normalizePreset).filter((p): p is QrStylePreset => p !== null);
    return clean.length ? clean : null;
  } catch (error) {
    console.error("[presets] unreadable store, falling back to factory presets", error);
    return null;
  }
}

export function loadPresets(): QrStylePreset[] {
  const stored = readRaw();
  if (!stored) return [...FACTORY_PRESETS];
  // Factory presets are always present, even if an old store dropped them.
  const missing = FACTORY_PRESETS.filter((f) => !stored.some((p) => p.id === f.id));
  return [...missing, ...stored];
}

export function savePresets(presets: QrStylePreset[]): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      PRESET_STORAGE_KEY,
      JSON.stringify({ version: PRESET_SCHEMA_VERSION, presets }),
    );
  } catch (error) {
    console.error("[presets] could not persist presets", error);
  }
}

export function findPresetByName(
  presets: QrStylePreset[],
  name: string,
): QrStylePreset | undefined {
  const needle = name.trim().toLowerCase();
  return presets.find((p) => p.name.trim().toLowerCase() === needle);
}

/** True when the live style equals a preset (drives the active checkmark). */
export function snapshotMatches(a: QrStyleSnapshot, b: QrStyleSnapshot): boolean {
  return (Object.keys(DEFAULT_SNAPSHOT) as (keyof QrStyleSnapshot)[]).every(
    (key) => a[key] === b[key],
  );
}
/* ── Sovereign data control: portable JSON preset files ─────────────────── */

export const PRESET_FILE_KIND = "rout.qr.presets";

/** Serialise the user's own presets into a portable, versioned JSON file. */
export function serializePresetFile(presets: QrStylePreset[]): string {
  return JSON.stringify(
    {
      kind: PRESET_FILE_KIND,
      version: PRESET_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      presets: presets
        .filter((p) => !p.factory)
        .map((p) => ({ id: p.id, name: p.name, version: PRESET_SCHEMA_VERSION, style: p.style })),
    },
    null,
    2,
  );
}

/**
 * Parse an uploaded preset file. Never throws: unusable input returns an empty
 * list so a bad file can only mean "nothing imported".
 */
export function parsePresetFile(raw: string): QrStylePreset[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.presets)
        ? parsed.presets
        : null;
    if (!list) return [];
    return list
      .map(normalizePreset)
      .filter((p): p is QrStylePreset => p !== null)
      .map((p) => ({ ...p, factory: false }));
  } catch (error) {
    console.error("[presets] could not parse imported file", error);
    return [];
  }
}
