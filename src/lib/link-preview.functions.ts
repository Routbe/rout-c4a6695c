import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

/**
 * Haalt de titel en de og:image van een gedeelde pagina op, zodat een favoriete
 * film, serie of boek automatisch de site-afbeelding toont. Het lid kan de
 * afbeelding daarna altijd zelf overschrijven.
 */
export const fetchLinkPreview = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => z.object({ url: z.string().url().max(600) }).parse(data))
  .handler(async ({ data, context }) => {
    const { enforceRateLimit } = await import("./rate-limit.server");
    enforceRateLimit(`link-preview:${context.userId}`, 20, 60_000);

    let target: URL;
    try {
      target = new URL(data.url);
    } catch {
      return { ok: false as const, reason: "invalid_url" as const };
    }
    if (target.protocol !== "https:" && target.protocol !== "http:") {
      return { ok: false as const, reason: "invalid_url" as const };
    }
    // Only well-known media/book/music sites may be previewed — no arbitrary outbound fetches.
    const ALLOWED = [
      "imdb.com", "themoviedb.org", "letterboxd.com", "rottentomatoes.com", "netflix.com",
      "disneyplus.com", "primevideo.com", "amazon.com", "goodreads.com", "bol.com",
      "openlibrary.org", "books.google.com", "spotify.com", "music.apple.com", "tv.apple.com",
      "deezer.com", "soundcloud.com", "youtube.com", "youtu.be", "steampowered.com", "myanimelist.net",
    ];
    const host = target.hostname.toLowerCase().replace(/\.$/, "");
    if (!ALLOWED.some((d) => host === d || host.endsWith(`.${d}`))) {
      return { ok: false as const, reason: "blocked_host" as const };
    }
    const { assertPublicHost, safePublicFetch } = await import("./safe-fetch.server");
    if (!(await assertPublicHost(target.hostname))) {
      return { ok: false as const, reason: "blocked_host" as const };
    }

    try {
      const res = await safePublicFetch(target, {
        headers: {
          // Browserachtige headers: IMDb, Goodreads en Spotify weigeren kale bots.
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "nl,en;q=0.8",
        },
      });
      if (!res) return { ok: false as const, reason: "blocked_host" as const };
      if (!res.ok) return { ok: false as const, reason: "unreachable" as const };
      const html = (await res.text()).slice(0, 600_000);

      const meta = (names: string[]): string | null => {
        for (const name of names) {
          const re = new RegExp(
            `<meta[^>]+(?:property|name|itemprop)=["']${name}["'][^>]*content=["']([^"']+)["']|` +
              `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["']${name}["']`,
            "i",
          );
          const m = re.exec(html);
          const value = (m?.[1] ?? m?.[2] ?? "").trim();
          if (value) return value;
        }
        return null;
      };

      /** Zoekt in JSON-LD (schema.org) naar `image` — IMDb & Goodreads zetten de cover daar. */
      const jsonLdImage = (): string | null => {
        const blocks = html.match(
          /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
        );
        if (!blocks) return null;
        const walk = (node: unknown, depth = 0): string | null => {
          if (depth > 6 || !node) return null;
          if (typeof node === "string") return /^https?:\/\//.test(node) ? node : null;
          if (Array.isArray(node)) {
            for (const item of node) {
              const found = walk(item, depth + 1);
              if (found) return found;
            }
            return null;
          }
          if (typeof node === "object") {
            const obj = node as Record<string, unknown>;
            for (const key of ["image", "thumbnailUrl", "primaryImageOfPage", "url"]) {
              if (key in obj) {
                const found = walk(obj[key], depth + 1);
                if (found) return found;
              }
            }
            for (const value of Object.values(obj)) {
              if (value && typeof value === "object") {
                const found = walk(value, depth + 1);
                if (found) return found;
              }
            }
          }
          return null;
        };
        for (const block of blocks) {
          const raw = block.replace(/^[\s\S]*?>/, "").replace(/<\/script>$/i, "");
          try {
            const found = walk(JSON.parse(raw));
            if (found) return found;
          } catch {
            // Ongeldige JSON-LD overslaan.
          }
        }
        return null;
      };

      /** Laatste redmiddel: de grootste cover-achtige <img> of preload-afbeelding. */
      const scrapedImage = (): string | null => {
        const preload =
          /<link[^>]+rel=["'](?:image_src|preload)["'][^>]*href=["']([^"']+\.(?:jpe?g|png|webp)[^"']*)["']/i.exec(
            html,
          );
        if (preload?.[1]) return preload[1];
        const candidates = [...html.matchAll(/<img[^>]+>/gi)]
          .map((m) => m[0])
          .filter((tag) =>
            /(poster|cover|artwork|hero|thumb|book|movie|media-amazon|images\.gr-assets|scdn\.co)/i.test(
              tag,
            ),
          );
        for (const tag of candidates) {
          const src =
            /(?:src|data-src|data-original)=["']([^"']+)["']/i.exec(tag)?.[1] ??
            /srcset=["']([^"'\s]+)/i.exec(tag)?.[1];
          if (src && /^(?:https?:)?\/\/|^\//.test(src) && !/\.svg(?:$|\?)/i.test(src)) return src;
        }
        return null;
      };

      const rawImage =
        meta([
          "og:image",
          "og:image:url",
          "og:image:secure_url",
          "twitter:image",
          "twitter:image:src",
          "image",
        ]) ??
        jsonLdImage() ??
        scrapedImage();

      const rawTitle =
        meta(["og:title", "twitter:title"]) ??
        /<title[^>]*>([^<]{1,200})<\/title>/i.exec(html)?.[1] ??
        null;

      let imageUrl: string | null = null;
      if (rawImage) {
        try {
          imageUrl = new URL(rawImage.replace(/^\/\//, "https://"), target).toString();
        } catch {
          imageUrl = null;
        }
      }
      return {
        ok: true as const,
        title: rawTitle ? rawTitle.trim().slice(0, 80) : null,
        imageUrl: imageUrl && /^https?:\/\//.test(imageUrl) ? imageUrl : null,
      };
    } catch (err) {
      console.error("[link-preview] ophalen mislukt", {
        host: target.hostname.toLowerCase(),
        error: err instanceof Error ? err.message : String(err),
      });
      return { ok: false as const, reason: "unreachable" as const };
    }
  });
