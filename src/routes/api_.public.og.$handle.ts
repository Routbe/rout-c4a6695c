import { createFileRoute } from "@tanstack/react-router";
import { parseDisplayPrefs } from "@/lib/profile-display";
import { ogSvg, type OgBadge, type OgAvatarShape } from "@/lib/og-card";
import { themeOf } from "@/lib/profile";
import { profileSurface } from "@/lib/profile-surface";
import { fontPairingOf } from "@/lib/profile-design";
import { ogHeadingFont } from "@/lib/og-fonts";
import { parseShareCardKind, parseShareCardLang, shareCardSvg } from "@/lib/og-action-card";
import { sanitizeHandleInput } from "@/lib/validations/sanitizeHandle";
import { OG_FORMATS, parseOgFormat } from "@/lib/og-formats";

/**
 * Dynamische OpenGraph-kaart (1200×630) voor profielen zonder eigen
 * uploadafbeelding. De vector wordt op de rand gerenderd — geen headless
 * browser, geen externe render-service, geen tracking.
 *
 * `/api/public/og/<handle>.png` levert een PNG (Discord, WhatsApp, Slack,
 * iMessage en LinkedIn tonen geen SVG-kaarten). `<handle>.svg` blijft
 * beschikbaar voor debug en voor crawlers die vector wél aankunnen.
 * `?format=square|portrait|story` levert dezelfde kaart in 1080×1080,
 * 1080×1350 of 1080×1920 (zonder parameter: de 1200×630 linkpreview).
 */
export const Route = createFileRoute("/api_/public/og/$handle")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const raw = String(params.handle ?? "");
        const wantsSvg = /\.svg$/i.test(raw);
        const handle = sanitizeHandleInput(raw.replace(/\.(svg|png)$/i, ""));
        const spaceParam = new URL(request.url).searchParams.get("space");
        const space = spaceParam === "alias" ? "alias" : spaceParam === "workspace" ? "workspace" : "root";
        if (!/^[a-z0-9._-]{2,40}$/.test(handle)) {
          return new Response("Invalid handle", { status: 400 });
        }

        let name = `@${handle}`;
        let tagline = "Eén soevereine link voor alles wat je maakt.";
        let verified = false;
        let accent = "#C9A84C";
        let design: Record<string, unknown> = { bg: "#131211" };
        let avatarUrl: string | null = null;
        let urlLabel: string | undefined;

        try {
          const { readOgProfile } = await import("@/lib/og-profile.server");
          const row = await readOgProfile(handle, space);
          if (!row) return new Response("Not found", { status: 404 });
          const prefs = parseDisplayPrefs(row["display_prefs"]);
          // Profielen die het lid op privé heeft gezet leveren nooit een
          // gepersonaliseerde kaart: bio, tagline en avatar blijven verborgen.
          if (!prefs.publicProfile) return new Response("Not found", { status: 404 });
          name = ((row["display_name"] as string | null) || `@${handle}`).trim();
          tagline =
            prefs.metaDescription ||
            ((row["tagline"] as string | null) ?? "").trim() ||
            ((row["bio"] as string | null) ?? "").trim().slice(0, 160) ||
            tagline;
          verified = Boolean(row["verified"]);
          // Studio-ontwerp: thema + eigen canvas/patroon, kopfont, avatarvorm, badge.
          const t = profileSurface(themeOf(String(row["theme"] ?? "")), prefs.canvasColor);
          const p = prefs as typeof prefs & Record<string, unknown>;
          const custom = Boolean(p["typographyCustom"] || p["customDesign"]);
          accent = prefs.accentColor ?? (p["patternColor"] as string | null) ?? t.accent ?? accent;
          const { publicBadgeKind } = await import("@/lib/badge-rules");
          const badge: OgBadge = publicBadgeKind({
            verified,
            isBusiness: row["is_business"] === true,
            isInfluencer: row["is_influencer"] === true,
            badgeVisible: prefs.badgeVisible,
            badgeType: prefs.badgeType,
          });
          design = {
            bg: (p["canvasColor"] as string | null) ?? t.bg,
            card: t.card,
            text: t.text,
            muted: t.muted,
            pattern: prefs.backgroundStyle,
            gradientFrom: prefs.bannerStyle === "gradient" ? prefs.bannerFrom : null,
            gradientTo: prefs.bannerStyle === "gradient" ? prefs.bannerTo : null,
            headingFont: ogHeadingFont(
              custom ? fontPairingOf(p["fontPairing"] as never).heading : prefs.typography === "serif" ? "'Playfair Display'" : prefs.typography === "mono" ? "'JetBrains Mono'" : "'Inter'",
            ),
            titleColor: custom ? ((p["titleColor"] as string | null) ?? null) : null,
            avatarShape: (prefs.avatarShape ?? "circle") as OgAvatarShape,
            badge,
          };
          urlLabel = space === "alias" ? `rout.be/u/${handle}` : space === "workspace" ? `rout.be/w/${handle}` : `rout.be/${handle}`;
          const avatar = row["avatar_url"] as string | null;
          avatarUrl = avatar || null;
        } catch {
          // Database onbereikbaar: toon de generieke ROUT-kaart.
        }

        const cache = "public, max-age=300, s-maxage=1800";
        const origin = new URL(request.url).origin;
        const { fetchImageAsDataUri } = await import("@/lib/og-render.server");
        // SVG loaded as an <img> cannot fetch nested remote images either.
        // Both formats therefore use the same first-party/proxied inline photo.
        const inlineAvatar = avatarUrl ? await fetchImageAsDataUri(avatarUrl, origin) : null;

        const search = new URL(request.url).searchParams;
        // Action links (ask/donate/tip/booking) get their own NGL-style invitation card.
        const kind = space === "workspace" ? null : parseShareCardKind(search.get("card"));
        const lang = parseShareCardLang(search.get("lang"));
        const format = parseOgFormat(search.get("format"));
        const base = space === "alias" ? `rout.be/u/${handle}` : `rout.be/${handle}`;
        const build = () =>
          kind
            ? shareCardSvg({ kind, lang, handle, name, avatarUrl: inlineAvatar, urlLabel: `${base}/${kind}`, format })
            : ogSvg({ handle, name, tagline, accent, ...design, bg: String(design.bg), avatarUrl: inlineAvatar, ...(urlLabel ? { urlLabel } : {}) }, format);

        if (!wantsSvg) {
          try {
            const { svgToPng } = await import("@/lib/og-render.server");
            const { cachedOgPng } = await import("@/lib/og-png-cache.server");
            // resvg haalt zelf geen externe afbeeldingen op: de avatar moet
            // als data-URI in de vector zitten voor we rasteriseren.
            const svg = build();
            const png = await cachedOgPng(svg, async () => new Uint8Array(await svgToPng(svg, origin, String(design.bg), OG_FORMATS[format].width)));
            return new Response(png as unknown as BodyInit, {
              headers: { "content-type": "image/png", "cache-control": cache },
            });
          } catch (error) {
            console.error("og png render failed", error);
            // A .png URL must always answer with a PNG (Snapchat/WhatsApp ignore SVG):
            // fall back to the static ROUT card, uncached so the next crawl retries.
            return new Response(null, { status: 302, headers: { location: `${origin}/brand/og/home-${lang}.png`, "cache-control": "no-store" } });
          }
        }

        const svg = build();

        return new Response(svg, {
          headers: {
            "content-type": "image/svg+xml; charset=utf-8",
            "cache-control": cache,
          },
        });
      },
    },
  },
});
