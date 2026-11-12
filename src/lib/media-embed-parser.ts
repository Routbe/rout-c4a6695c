/**
 * Universal Smart Media & Audio Embed parser.
 *
 * `resolveMediaEmbed(url)` herkent YouTube, Spotify, SoundCloud, Apple Music,
 * Vimeo en PDF-documenten en levert een privacy-vriendelijke embed-URL plus
 * metadata voor de renderer. Pure functie — geen netwerkcalls.
 */

export type MediaProvider = "youtube" | "spotify" | "soundcloud" | "applemusic" | "vimeo" | "pdf";

export type MediaKind = "video" | "audio" | "document";

export interface MediaEmbed {
  provider: MediaProvider;
  kind: MediaKind;
  /** Privacy-enhanced / officiële iframe-embed-URL. */
  embedUrl: string;
  /** Oorspronkelijke, genormaliseerde URL. */
  sourceUrl: string;
  /** Platform-id (video-id, track-id, …) indien bekend. */
  externalId: string | null;
  /** Menselijke badge voor de Studio ("YouTube-video", "Spotify-track", …). */
  label: string;
}

const YOUTUBE_ID = /^[\w-]{6,20}$/;

function youtubeId(u: URL): string | null {
  const host = u.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtu.be") {
    const id = u.pathname.split("/").filter(Boolean)[0] ?? "";
    return YOUTUBE_ID.test(id) ? id : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") {
      const id = u.searchParams.get("v") ?? "";
      return YOUTUBE_ID.test(id) ? id : null;
    }
    const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]{6,20})/);
    if (m) return m[2];
  }
  return null;
}

const SPOTIFY_TYPES = new Set(["track", "album", "playlist", "episode", "show", "artist"]);

function spotifyParts(u: URL): { type: string; id: string } | null {
  if (u.hostname !== "open.spotify.com") return null;
  // Tolerant voor locale-prefixen zoals /intl-nl/track/…
  const parts = u.pathname.split("/").filter(Boolean);
  const clean = parts[0]?.startsWith("intl-") ? parts.slice(1) : parts;
  const [type, id] = clean;
  if (!type || !id || !SPOTIFY_TYPES.has(type)) return null;
  if (!/^[\w]{10,40}$/.test(id)) return null;
  return { type, id };
}

function vimeoId(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, "");
  if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;
  const m = u.pathname.match(/^(?:\/video)?\/(\d{6,12})/);
  return m ? m[1] : null;
}

/** Hoofdfunctie: resolveer een URL naar een embed, of `null` als onbekend. */
export function resolveMediaEmbed(raw: string): MediaEmbed | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let u: URL;
  try {
    u = new URL(withProto);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();

  // YouTube (video's & Shorts) — privacy-enhanced nocookie-domein.
  const yt = youtubeId(u);
  if (yt) {
    return {
      provider: "youtube",
      kind: "video",
      embedUrl: `https://www.youtube-nocookie.com/embed/${yt}`,
      sourceUrl: u.toString(),
      externalId: yt,
      label: "YouTube-video",
    };
  }

  // Spotify (tracks, albums, playlists, podcasts).
  const sp = spotifyParts(u);
  if (sp) {
    return {
      provider: "spotify",
      kind: "audio",
      embedUrl: `https://open.spotify.com/embed/${sp.type}/${sp.id}`,
      sourceUrl: u.toString(),
      externalId: sp.id,
      label: `Spotify-${sp.type}`,
    };
  }

  // SoundCloud — Widget API player.
  if (host === "soundcloud.com" || host === "www.soundcloud.com" || host === "m.soundcloud.com") {
    const path = u.pathname.replace(/\/+$/, "");
    if (!path || path === "/") return null;
    return {
      provider: "soundcloud",
      kind: "audio",
      embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(
        `https://soundcloud.com${path}`,
      )}&visual=false`,
      sourceUrl: u.toString(),
      externalId: null,
      label: "SoundCloud-track",
    };
  }

  // Apple Music.
  if (host === "music.apple.com" || host === "embed.music.apple.com") {
    return {
      provider: "applemusic",
      kind: "audio",
      embedUrl: u.toString().replace("music.apple.com", "embed.music.apple.com"),
      sourceUrl: u.toString(),
      externalId: null,
      label: "Apple Music",
    };
  }

  // Vimeo.
  const vm = vimeoId(u);
  if (vm) {
    return {
      provider: "vimeo",
      kind: "video",
      embedUrl: `https://player.vimeo.com/video/${vm}`,
      sourceUrl: u.toString(),
      externalId: vm,
      label: "Vimeo-video",
    };
  }

  // PDF-documenten.
  if (u.pathname.toLowerCase().endsWith(".pdf")) {
    return {
      provider: "pdf",
      kind: "document",
      embedUrl: u.toString(),
      sourceUrl: u.toString(),
      externalId: null,
      label: "PDF-document",
    };
  }

  return null;
}
