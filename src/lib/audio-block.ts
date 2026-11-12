/**
 * Universal Audio Block — provider-agnostic media primitive.
 *
 * One block plays any hosted audio file (S3/Storage object, podcast MP3,
 * externally generated stream): ROUT stores only the pointer (URL, title,
 * transcript), never third-party API keys and never the audio itself.
 * Pure functions, browser-safe; the stored value is a JSON string like the
 * other widget blocks (media_embed, gallery, …).
 */

export interface AudioBlockConfig {
  /** https URL of the hosted audio file or stream. */
  url: string;
  /** Optional caption shown above the player; doubles as the block title. */
  caption: string;
  /** Optional transcript shown under the player (accessibility + SEO). */
  transcript: string;
}

export const AUDIO_BLOCK_LIMITS = { url: 500, caption: 120, transcript: 2000 } as const;

export const DEFAULT_AUDIO_BLOCK: AudioBlockConfig = { url: "", caption: "", transcript: "" };

/** Only https URLs: no javascript:/data: schemes, no protocol-relative surprises. */
export function isAudioBlockUrl(raw: string): boolean {
  const v = raw.trim();
  if (!v || v.length > AUDIO_BLOCK_LIMITS.url) return false;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`);
    return u.protocol === "https:" && Boolean(u.hostname.includes("."));
  } catch {
    return false;
  }
}

/** Normalizes a bare host/path to an https URL; returns "" for invalid input. */
export function normalizeAudioBlockUrl(raw: string): string {
  const v = raw.trim();
  if (!isAudioBlockUrl(v)) return "";
  return /^https:\/\//i.test(v) ? v : `https://${v}`;
}

/** Reads stored JSON defensively: invalid or unknown data becomes an empty block. */
export function parseAudioBlockConfig(raw: string | undefined | null): AudioBlockConfig {
  if (!raw) return { ...DEFAULT_AUDIO_BLOCK };
  try {
    const parsed = JSON.parse(raw) as Partial<AudioBlockConfig>;
    return {
      url: typeof parsed.url === "string" ? parsed.url.slice(0, AUDIO_BLOCK_LIMITS.url) : "",
      caption: typeof parsed.caption === "string" ? parsed.caption.slice(0, AUDIO_BLOCK_LIMITS.caption) : "",
      transcript: typeof parsed.transcript === "string" ? parsed.transcript.slice(0, AUDIO_BLOCK_LIMITS.transcript) : "",
    };
  } catch {
    return { ...DEFAULT_AUDIO_BLOCK };
  }
}

export function serializeAudioBlockConfig(config: AudioBlockConfig): string {
  return JSON.stringify({
    url: config.url.trim().slice(0, AUDIO_BLOCK_LIMITS.url),
    caption: config.caption.trim().slice(0, AUDIO_BLOCK_LIMITS.caption),
    transcript: config.transcript.trim().slice(0, AUDIO_BLOCK_LIMITS.transcript),
  });
}
