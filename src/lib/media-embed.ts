/**
 * Configuratie van het `media_embed`-blok: welke URL, welke weergave.
 * Opgeslagen als JSON in `ProfileBlock.value`.
 */

export type MediaEmbedRatio = "16:9" | "9:16" | "compact" | "expanded";

export interface MediaEmbedConfig {
  url: string;
  ratio: MediaEmbedRatio;
  caption: string;
}

export const MEDIA_EMBED_RATIOS: { id: MediaEmbedRatio; label: string; hint: string }[] = [
  { id: "16:9", label: "16:9", hint: "Standaard video" },
  { id: "9:16", label: "9:16", hint: "Shorts / Reels / TikTok" },
  { id: "compact", label: "Compact", hint: "Smalle audiostrip" },
  { id: "expanded", label: "Uitgebreid", hint: "Volledige artwork-kaart" },
];

export const DEFAULT_MEDIA_EMBED: MediaEmbedConfig = {
  url: "",
  ratio: "16:9",
  caption: "",
};

export function parseMediaEmbedConfig(raw: string | undefined | null): MediaEmbedConfig {
  if (!raw) return { ...DEFAULT_MEDIA_EMBED };
  // Tolerante modus: kale URL (oudere blokken) wordt een config.
  if (!raw.trim().startsWith("{")) return { ...DEFAULT_MEDIA_EMBED, url: raw.trim() };
  try {
    const parsed = JSON.parse(raw) as Partial<MediaEmbedConfig>;
    return {
      url: typeof parsed.url === "string" ? parsed.url : "",
      ratio: MEDIA_EMBED_RATIOS.some((r) => r.id === parsed.ratio)
        ? (parsed.ratio as MediaEmbedRatio)
        : "16:9",
      caption: typeof parsed.caption === "string" ? parsed.caption : "",
    };
  } catch {
    return { ...DEFAULT_MEDIA_EMBED };
  }
}

export function serializeMediaEmbedConfig(config: MediaEmbedConfig): string {
  return JSON.stringify({
    url: config.url.trim(),
    ratio: config.ratio,
    caption: config.caption.trim(),
  });
}
