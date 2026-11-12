/**
 * Handle-invoer & smart-paste parser voor sociale links.
 *
 * Sociale blokken bewaren enkel de platform-identifier (`block.kind`) en de
 * pure handle (`block.value`, zonder `@`). De publieke URL wordt pas bij het
 * renderen opgebouwd via `blockHref()` en de `base` uit BLOCK_KINDS.
 *
 * Client-safe: geen server-imports.
 */

import { BLOCK_KINDS, wsocialHandle } from "@/lib/profile";

/** Platform-specifieke extractieregels voor volledige geplakte URLs. */
const PLATFORM_PATTERNS: Record<string, RegExp[]> = {
  instagram: [/instagram\.com\/([A-Za-z0-9_.]+)/i],
  youtube: [/youtube\.com\/@?([A-Za-z0-9_.-]+)/i, /youtu\.be\/([A-Za-z0-9_.-]+)/i],
  tiktok: [/tiktok\.com\/@?([A-Za-z0-9_.]+)/i],
  x: [/(?:x|twitter)\.com\/([A-Za-z0-9_]+)/i],
  github: [/github\.com\/([A-Za-z0-9_-]+)/i],
  facebook: [/facebook\.com\/([A-Za-z0-9_.]+)/i],
  linkedin: [/linkedin\.com\/(?:in|company)\/([A-Za-z0-9_-]+)/i],
  bluesky: [/bsky\.app\/profile\/([A-Za-z0-9_.-]+)/i],
  wsocial: [/wsocial\.(?:eu|be)\/profile\/([A-Za-z0-9_.-]+)/i, /wsocial\.(?:eu|be)\/@?([A-Za-z0-9_.-]+)/i],
  spotify: [/open\.spotify\.com\/(?:user|artist)\/([A-Za-z0-9]+)/i],
  twitch: [/twitch\.tv\/([A-Za-z0-9_]+)/i],
  threads: [/threads\.(?:net|com)\/@?([A-Za-z0-9_.]+)/i],
  pinterest: [/pinterest\.[a-z.]+\/([A-Za-z0-9_]+)/i],
  snapchat: [/snapchat\.com\/add\/([A-Za-z0-9_.-]+)/i],
  telegram: [/t\.me\/([A-Za-z0-9_]+)/i],
  reddit: [/reddit\.com\/(u(?:ser)?\/[A-Za-z0-9_-]+|r\/[A-Za-z0-9_]+)/i],
  gitlab: [/gitlab\.com\/([A-Za-z0-9_.-]+)/i],
  kick: [/kick\.com\/([A-Za-z0-9_-]+)/i],
  dribbble: [/dribbble\.com\/([A-Za-z0-9_-]+)/i],
  behance: [/behance\.net\/([A-Za-z0-9_-]+)/i],
  codepen: [/codepen\.io\/([A-Za-z0-9_-]+)/i],
  vk: [/vk\.com\/([A-Za-z0-9_.]+)/i],
  matrix: [/matrix\.to\/#\/@?([A-Za-z0-9_.=\-\/:]+)/i],
  eyou: [/eyou\.social\/u\/([A-Za-z0-9_.-]+)/i],
  patreon: [/patreon\.com\/(?:c\/)?([A-Za-z0-9_.-]+)/i],
  paypal: [/paypal\.me\/([A-Za-z0-9_.-]+)/i],
  kofi: [/ko-fi\.com\/([A-Za-z0-9_]+)/i],
  bmac: [/buymeacoffee\.com\/([A-Za-z0-9_.-]+)/i],
  revolut: [/revolut\.me\/([A-Za-z0-9_.-]+)/i],
  readcv: [/read\.cv\/([A-Za-z0-9_.-]+)/i],
  opencollective: [/opencollective\.com\/([A-Za-z0-9_.-]+)/i],
  soundcloud: [/soundcloud\.com\/([A-Za-z0-9_-]+)/i],
  lastfm: [/last\.fm\/user\/([A-Za-z0-9_.-]+)/i],
  letterboxd: [/letterboxd\.com\/([A-Za-z0-9_]+)/i],
  myanimelist: [/myanimelist\.net\/profile\/([A-Za-z0-9_-]+)/i],
  trakt: [/trakt\.tv\/users\/([A-Za-z0-9_.-]+)/i],
  calcom: [/cal\.com\/([A-Za-z0-9_.-]+)/i],
  calendly: [/calendly\.com\/([A-Za-z0-9_.-]+)/i],
};

/** Het zichtbare prefix in het invoerveld, bv. `instagram.com/`. */
export function handlePrefix(kind: string): string | null {
  if (kind === "wsocial") return "@";
  const def = BLOCK_KINDS.find((k) => k.kind === kind);
  if (!def?.base) return null;
  return def.base.replace(/^https?:\/\//, "");
}

/** Sociale blokken werken op handle-basis; custom links blijven volledige URLs. */
export const isHandleBlock = (kind: string) => handlePrefix(kind) !== null;

/**
 * Haalt de pure handle uit ruwe invoer: knipt `@`, spaties, volledige URLs,
 * querystrings (`?igsh=…`) en trailing slashes weg.
 */
export function extractHandle(kind: string, raw: string): string {
  let value = (raw ?? "").trim();
  if (!value) return "";

  const looksLikeUrl =
    /^(https?:\/\/|www\.)/i.test(value) || /[a-z0-9-]+\.[a-z]{2,}\//i.test(value);

  if (looksLikeUrl) {
    for (const pattern of PLATFORM_PATTERNS[kind] ?? []) {
      const match = value.match(pattern);
      if (match?.[1]) return match[1];
    }
    // Onbekend platform: neem het laatste betekenisvolle padsegment.
    const stripped = value
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split(/[?#]/)[0]!
      .replace(/\/+$/, "");
    const parts = stripped.split("/").filter(Boolean);
    if (parts.length > 1) value = parts[parts.length - 1]!;
  }

  return value
    .split(/[?#]/)[0]!
    .replace(/^\/+|\/+$/g, "")
    .replace(/^@+/, "")
    .trim();
}

/** Volledige publieke URL voor een platform + handle. */
export function socialUrl(kind: string, handle: string): string {
  const def = BLOCK_KINDS.find((k) => k.kind === kind);
  const clean = normalizeSocialHandle(handle);
  if (!def?.base || !clean) return "";
  return `${def.base}${kind === "wsocial" ? wsocialHandle(clean) : clean}`;
}

/** Platformspecifieke handleregels voor inline validatie. */
export const HANDLE_RULES: Record<
  string,
  { pattern: RegExp; maxLength: number; label: string; extra?: (h: string) => boolean }
> = {
  instagram: { pattern: /^[a-zA-Z0-9_.]+$/, maxLength: 30, label: "Instagram" },
  github: {
    pattern: /^[a-zA-Z0-9-]+$/,
    maxLength: 39,
    label: "GitHub",
    // Geen opeenvolgende koppeltekens, niet beginnen/eindigen met een koppelteken.
    extra: (h) => !h.includes("--") && !h.startsWith("-") && !h.endsWith("-"),
  },
  x: { pattern: /^[a-zA-Z0-9_]{1,15}$/, maxLength: 15, label: "X" },
  twitter: { pattern: /^[a-zA-Z0-9_]{1,15}$/, maxLength: 15, label: "X" },
  tiktok: { pattern: /^[a-zA-Z0-9_.]+$/, maxLength: 24, label: "TikTok" },
  twitch: { pattern: /^[a-zA-Z0-9_]+$/, maxLength: 25, label: "Twitch" },
  telegram: { pattern: /^[a-zA-Z0-9_]+$/, maxLength: 32, label: "Telegram" },
};

/** Trim + lowercase: de vorm die we opslaan en in publieke links gebruiken. */
export function normalizeSocialHandle(raw: string): string {
  return (raw ?? "").trim().replace(/^@+/, "").toLowerCase();
}

/**
 * Inline validatiemelding voor een handle, of `null` wanneer alles klopt.
 * Lege invoer geeft geen fout (het veld is dan simpelweg niet ingevuld).
 */
export function handleValidationError(kind: string, raw: string): string | null {
  const handle = normalizeSocialHandle(raw);
  if (!handle) return null;
  const rule = HANDLE_RULES[kind];
  if (!rule) return null;
  if (handle.length > rule.maxLength) {
    return `⚠️ Maximaal ${rule.maxLength} tekens voor een ${rule.label} handle`;
  }
  if (!rule.pattern.test(handle) || (rule.extra && !rule.extra(handle))) {
    return `⚠️ Ongeldige tekens voor ${rule.label} handle`;
  }
  return null;
}
