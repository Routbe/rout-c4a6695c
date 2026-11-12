/**
 * Share-image formats. Every code-drawn card (profile and action cards) exists in
 * each format; "landscape" is the link-preview card crawlers read from og:image.
 * Story keeps everything important between the platform overlays (top 250 px and
 * bottom 340 px on Instagram, Snapchat, TikTok and WhatsApp status).
 */
export type OgFormat = "landscape" | "square" | "portrait" | "story";

export const OG_FORMATS: Record<OgFormat, { width: number; height: number; safeTop: number; safeBottom: number }> = {
  landscape: { width: 1200, height: 630, safeTop: 0, safeBottom: 0 },
  square: { width: 1080, height: 1080, safeTop: 60, safeBottom: 60 },
  portrait: { width: 1080, height: 1350, safeTop: 80, safeBottom: 80 },
  story: { width: 1080, height: 1920, safeTop: 250, safeBottom: 340 },
};

export const OG_FORMAT_ORDER: OgFormat[] = ["landscape", "square", "portrait", "story"];

export function parseOgFormat(value: string | null | undefined): OgFormat {
  return value === "square" || value === "portrait" || value === "story" ? value : "landscape";
}

/** Query fragment for a format; landscape adds nothing so existing URLs stay identical. */
export function ogFormatQuery(format: OgFormat): string {
  return format === "landscape" ? "" : `format=${format}`;
}
