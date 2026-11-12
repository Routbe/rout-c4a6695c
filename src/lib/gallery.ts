/**
 * Native mediagalerij (`media_gallery`).
 *
 * De volledige configuratie van een galerijblok wordt als JSON in
 * `ProfileBlock.value` bewaard, net zoals het boekingsblok. Client-safe:
 * geen server-imports.
 */

export type GalleryLayout = "list" | "grid" | "carousel" | "showcase";

export interface GalleryItem {
  id: string;
  /** Publieke afbeeldings-URL (eigen upload of externe hotlink). */
  url: string;
  /** Korte omschrijving onder de foto. */
  caption?: string;
  /** Toegankelijkheidslabel. */
  alt?: string;
  /** Optionele doellink: klikken op de foto opent deze URL. */
  linkUrl?: string;
}

export interface GalleryConfig {
  title: string;
  layout: GalleryLayout;
  items: GalleryItem[];
}

export const GALLERY_LAYOUTS: { id: GalleryLayout; label: string; hint: string }[] = [
  { id: "list", label: "Lijst", hint: "Verticale kaarten met caption" },
  { id: "grid", label: "Grid", hint: "Responsief fotoraster" },
  { id: "carousel", label: "Carousel", hint: "Horizontaal swipen" },
  { id: "showcase", label: "Showcase", hint: "Grote hero + thumbnails" },
];

export const GALLERY_MAX_ITEMS = 24;
export const GALLERY_MAX_BYTES = 10 * 1024 * 1024;
export const GALLERY_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
];

export const emptyGalleryConfig = (): GalleryConfig => ({
  title: "Mijn galerij",
  layout: "grid",
  items: [],
});

const isLayout = (value: unknown): value is GalleryLayout =>
  typeof value === "string" && GALLERY_LAYOUTS.some((l) => l.id === value);

const str = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/** Tolerante parser: onbekende of stukke JSON geeft een lege galerij. */
export function parseGalleryConfig(raw: string | null | undefined): GalleryConfig {
  const base = emptyGalleryConfig();
  if (!raw || !raw.trim()) return base;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return base;
  }
  if (!parsed || typeof parsed !== "object") return base;
  const obj = parsed as Record<string, unknown>;
  const items = Array.isArray(obj["items"]) ? obj["items"] : [];

  return {
    title: str(obj["title"], 80) || base.title,
    layout: isLayout(obj["layout"]) ? obj["layout"] : base.layout,
    items: items
      .filter((i): i is Record<string, unknown> => Boolean(i) && typeof i === "object")
      .map((i, index) => ({
        id: str(i["id"], 40) || `g_${index}`,
        url: str(i["url"], 2000),
        caption: str(i["caption"], 160) || undefined,
        alt: str(i["alt"], 160) || undefined,
        linkUrl: str(i["linkUrl"], 2000) || undefined,
      }))
      .filter((i) => i.url !== "")
      .slice(0, GALLERY_MAX_ITEMS),
  };
}

export const serializeGalleryConfig = (config: GalleryConfig): string =>
  JSON.stringify({
    title: config.title.trim(),
    layout: config.layout,
    items: config.items.slice(0, GALLERY_MAX_ITEMS),
  });

export const newGalleryItemId = () =>
  `g_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Accepteert enkel http(s)-URLs of onze eigen media-route. */
export function isValidImageUrl(raw: string): boolean {
  const value = (raw ?? "").trim();
  if (!value) return false;
  if (value.startsWith("/api/public/gallery-media?")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Veilige doellink voor een galerij-item (of `undefined`). */
export function galleryLinkHref(item: GalleryItem): string | undefined {
  const raw = (item.linkUrl ?? "").trim();
  if (!raw) return undefined;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw.replace(/^\/+/, "")}`;
}

/** Uploaded photos count toward free storage; image links never do. */
export function galleryUploadCount(items: readonly { url: string }[]): number {
  return items.filter((item) => item.url.startsWith("/api/public/gallery-media?")).length;
}
