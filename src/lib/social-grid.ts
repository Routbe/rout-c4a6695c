/**
 * Social Grid (`social_grid`): a Linkin.bio-style raster of cards, each with
 * its own destination link.
 *
 * Like the gallery, the whole configuration lives as JSON in
 * `ProfileBlock.value`, so it follows the Studio's private draft → publish
 * flow: nothing reaches the public hub before the member clicks Publish.
 * The same parser runs in the editor, on the server before a draft is saved,
 * and on render — client input is never trusted. Client-safe: no server imports.
 */

import { classifyOmniUrl, isLocalOmniMediaUrl, isOmniContentType, type OmniContentType } from "./omni-ingest";
import { localGridMediaPath } from "./omni-media";

export const SOCIAL_GRID_KIND = "social_grid";
export const SOCIAL_GRID_PLATFORMS = ["instagram", "tiktok", "article", "custom"] as const;
export type SocialGridPlatform = (typeof SOCIAL_GRID_PLATFORMS)[number];

export const SOCIAL_GRID_MAX_ITEMS = 30;

export interface SocialGridItem {
  id: string;
  /** Persisted first-party media only; no live remote image proxies. */
  mediaUrl: string;
  caption?: string;
  /** https URL or a same-site path ("/jouwnaam"); empty = card is not clickable. */
  targetUrl?: string;
  platform: SocialGridPlatform;
  /** Shows the small reel/video icon in the corner. */
  isVideo: boolean;
  /** Pinned cards always come first on the public hub. */
  pinned: boolean;
  createdAt: string;
  /** Omni-Matrix semantics: drives the corner badge. Absent on older cards. */
  contentType?: OmniContentType;
  /** Short context such as "5 min" or "45:00". */
  metaTag?: string;
  /** Hero cards span two columns on the public hub. */
  isHero?: boolean;
  /** First-party WebM/MP4 loop played on hover / long-press. */
  kineticPreviewUrl?: string;
}

export interface SocialGridConfig {
  title: string;
  items: SocialGridItem[];
}

export const emptySocialGridConfig = (title = ""): SocialGridConfig => ({ title, items: [] });

const str = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

/** Persisted media only. Ownership is enforced again by the serving endpoint. */
export function isSocialGridMediaUrl(raw: string): boolean {
  const value = (raw ?? "").trim();
  if (!value || value.length > 2000 || CONTROL.test(value)) return false;
  return localGridMediaPath(value) !== null;
}

/**
 * Normalizes a destination: https URLs (a bare domain gets https://) or a
 * same-site path. Everything else — http, javascript:, data:, protocol-relative
 * or backslash tricks, credentials — returns null.
 */
export function normalizeSocialGridTarget(raw: string): string | null {
  const value = (raw ?? "").trim();
  if (!value || value.length > 2000 || CONTROL.test(value) || value.includes("\\")) return null;
  if (value.startsWith("/")) {
    if (value.startsWith("//") || /%2f|%5c/i.test(value.slice(0, 4))) return null;
    return value;
  }
  let candidate = value;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate)) {
    if (!/^[\w-]+(\.[\w-]+)+(:\d+)?([/?#]|$)/.test(candidate)) return null;
    candidate = `https://${candidate}`;
  }
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) return null;
  return url.toString();
}

export const isInternalSocialGridTarget = (target: string) => target.startsWith("/");

/** "Smart URL mapping": guesses the platform and reel flag from a destination link. */
export function detectSocialGridTarget(target: string): { platform: SocialGridPlatform; isVideo: boolean } | null {
  if (!target || isInternalSocialGridTarget(target)) return null;
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname.toLowerCase();
  if (host === "instagram.com" || host.endsWith(".instagram.com")) {
    return { platform: "instagram", isVideo: /^\/(reels?|tv)\//.test(path) || /\/reels?\//.test(path) };
  }
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    return { platform: "tiktok", isVideo: true };
  }
  return null;
}

const isPlatform = (value: unknown): value is SocialGridPlatform =>
  typeof value === "string" && (SOCIAL_GRID_PLATFORMS as readonly string[]).includes(value);

const isoOrNull = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};

/** Tolerant parser: broken JSON gives an empty grid; invalid cards are dropped, invalid links removed. */
export function parseSocialGridConfig(raw: string | null | undefined): SocialGridConfig {
  const base = emptySocialGridConfig();
  if (!raw || !raw.trim()) return base;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return base;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return base;
  const obj = parsed as Record<string, unknown>;
  const rawItems = Array.isArray(obj["items"]) ? obj["items"] : [];
  const seen = new Set<string>();
  const items: SocialGridItem[] = [];
  for (const [index, entry] of rawItems.entries()) {
    if (items.length >= SOCIAL_GRID_MAX_ITEMS) break;
    if (!entry || typeof entry !== "object") continue;
    const i = entry as Record<string, unknown>;
    const mediaUrl = str(i["mediaUrl"], 2000);
    if (!isSocialGridMediaUrl(mediaUrl)) continue;
    let id = str(i["id"], 40).replace(/[^\w-]/g, "") || `sg_${index}`;
    if (seen.has(id)) id = `${id}_${index}`;
    seen.add(id);
    const target = normalizeSocialGridTarget(str(i["targetUrl"], 2000));
    items.push({
      id,
      mediaUrl,
      caption: str(i["caption"], 150) || undefined,
      targetUrl: target ?? undefined,
      platform: isPlatform(i["platform"]) ? i["platform"] : "custom",
      isVideo: i["isVideo"] === true,
      pinned: i["pinned"] === true,
      createdAt: isoOrNull(i["createdAt"]) ?? new Date(0).toISOString(),
      contentType: isOmniContentType(i["contentType"]) ? i["contentType"] : target && !target.startsWith("/") ? classifyOmniUrl(target) : "social",
      metaTag: str(i["metaTag"], 40) || undefined,
      isHero: i["isHero"] === true || undefined,
      kineticPreviewUrl: (() => {
        const v = str(i["kineticPreviewUrl"], 2000);
        return isLocalOmniMediaUrl(v) ? v : undefined;
      })(),
    });
  }
  return { title: str(obj["title"], 80), items };
}

export const serializeSocialGridConfig = (config: SocialGridConfig): string =>
  JSON.stringify({
    title: config.title.trim().slice(0, 80),
    items: config.items.slice(0, SOCIAL_GRID_MAX_ITEMS),
  });

/** Public order: pinned cards first, otherwise the order the member arranged. */
export const orderedSocialGridItems = (items: readonly SocialGridItem[]): SocialGridItem[] => [
  ...items.filter((i) => i.pinned),
  ...items.filter((i) => !i.pinned),
];

/** Moves one card to a new index (drag & drop / up-down buttons). */
export function moveSocialGridItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length || to < 0 || to >= items.length) return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as T);
  return next;
}

export const newSocialGridItemId = () =>
  `sg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Server boundary: re-normalizes every Social Grid block before it is written
 * to a draft. Other blocks pass through untouched.
 */
export function normalizeSocialGridBlocks<T>(blocks: T[]): T[] {
  return blocks.map((block) => {
    if (!block || typeof block !== "object") return block;
    const b = block as Record<string, unknown>;
    if (b["kind"] !== SOCIAL_GRID_KIND) return block;
    const value = typeof b["value"] === "string" ? b["value"] : "";
    return { ...b, value: serializeSocialGridConfig(parseSocialGridConfig(value)) } as T;
  });
}
