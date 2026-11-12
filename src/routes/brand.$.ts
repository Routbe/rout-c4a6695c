import { createFileRoute } from "@tanstack/react-router";

/**
 * Vaste ROUT-URL voor merkbestanden.
 * - `/brand/og/<pagina>-<taal>.png`: in code getekende deel-kaart. Eén keer
 *   gerenderd, daarna bewaard in de interne Scaleway-bucket en van daar geleverd.
 * - `/brand/press/<bestand>`: perskit, via Scaleway met lokale terugval.
 */
const OG_RE = /^og\/([a-z]+(?:-[a-z]+)*)-(nl|en|fr|de)\.png$/;
const PATH_OG_RE = /^og\/p\/([a-z0-9~-]+)-(nl|en|fr|de)\.png$/;
const PRESS_RE = /^press\/[a-z0-9-]+\.(png|svg|zip)$/;
/** Versie in de opslagsleutel: verhogen wanneer het ontwerp verandert. */
const OG_VERSION = "v4";

const LONG_CACHE = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400";

export const Route = createFileRoute("/brand/$")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const path = String(params._splat ?? "");
        const url = new URL(request.url);
        const { wantsSquareCard } = await import("@/lib/path-cards");
        const square = wantsSquareCard(request.headers.get("user-agent"), url.searchParams.get("f"));
        const pathOg = PATH_OG_RE.exec(path);
        if (pathOg) return servePathOg(pathOg[1]!, pathOg[2] as "nl" | "en" | "fr" | "de", url.origin, square);
        const og = OG_RE.exec(path);
        if (og) return serveOg(og[1]!, og[2] as "nl" | "en" | "fr" | "de", url.origin, square);
        if (!PRESS_RE.test(path)) return new Response("Not found", { status: 404 });
        try {
          const { storageConfigured, presignedGetUrl } = await import("@/lib/storage/s3.server");
          if (storageConfigured("internal")) {
            const url = await presignedGetUrl("internal", `brand/${path}`, 60 * 60 * 24);
            return new Response(null, { status: 302, headers: { location: url, "cache-control": "public, max-age=3600" } });
          }
        } catch (error) {
          console.error("[brand] presign failed", error);
        }
        return new Response(null, { status: 302, headers: { location: `/${path}`, "cache-control": "public, max-age=300" } });
      },
    },
  },
});

type Loc = "nl" | "en" | "fr" | "de";
/** Square variants differ per crawler (Snapchat): caches must key on the User-Agent too. */
const VARY = { vary: "User-Agent" };

async function serveOg(page: string, locale: Loc, origin: string, square: boolean) {
  const og = await import("@/lib/page-og.server");
  const topic = page.startsWith("discover-") ? page.slice("discover-".length) : null;
  const { isTopicSlug, TOPIC_CARD_ACCENT } = await import("@/lib/discover/topics");
  if (topic !== null ? !isTopicSlug(topic) : !og.isPageKey(page)) return new Response("Not found", { status: 404 });
  return renderCached(`brand/og/${OG_VERSION}/${square ? "sq/" : ""}${page}-${locale}.png`, origin, square, page !== "home" ? `${origin}/brand/og/home-${locale}.png` : null, async () => {
    if (topic !== null && isTopicSlug(topic)) {
      const { discoverCopy } = await import("@/lib/discover/copy");
      const copy = discoverCopy(locale).topics[topic];
      if (square) return og.renderSquareCardSvg({ label: copy.brand, title: copy.title, desc: copy.lead, accent: TOPIC_CARD_ACCENT[topic][0], url: `rout.be/discover/${topic}` });
      return og.renderTopicCardSvg(topic, locale, copy);
    }
    const key = page as Parameters<typeof og.renderPageCardSvg>[0];
    return square ? og.renderSquareCardSvg(og.pageCardFields(key, locale)) : og.renderPageCardSvg(key, locale);
  });
}

/** Doc pages and whitelisted static pages; text never comes from the request. */
async function servePathOg(slug: string, locale: Loc, origin: string, square: boolean) {
  const { slugToPath, STATIC_PATH_CARDS, SECTION_ACCENT } = await import("@/lib/path-cards");
  const path = slugToPath(slug);
  if (!path) return new Response("Not found", { status: 404 });
  let fields: { label: string; title: string; desc: string; accent: string } | undefined = STATIC_PATH_CARDS[path];
  if (!fields) {
    const { getDoc, DOC_LABELS } = await import("@/lib/docs-catalog");
    const doc = getDoc(path, locale);
    if (!doc) return new Response("Not found", { status: 404 });
    fields = { label: DOC_LABELS[doc.category], title: doc.title, desc: doc.description, accent: SECTION_ACCENT[doc.category] ?? "#C9A84C" };
  }
  const card = { ...fields, url: `rout.be${path}` };
  const og = await import("@/lib/page-og.server");
  return renderCached(`brand/og/${OG_VERSION}/p/${square ? "sq/" : ""}${slug}-${locale}.png`, origin, square, `${origin}/brand/og/home-${locale}.png`, async () => (square ? og.renderSquareCardSvg(card) : og.renderPathCardSvg(card)));
}

async function renderCached(key: string, origin: string, square: boolean, fallback: string | null, draw: () => Promise<string>) {
  const s3 = await import("@/lib/storage/s3.server");
  const stored = s3.storageConfigured("internal");
  if (stored) {
    try {
      const url = await s3.presignedGetUrl("internal", key, 60 * 60 * 24 * 7);
      const head = await fetch(url, { method: "HEAD" });
      if (head.ok) return new Response(null, { status: 302, headers: { location: url, "cache-control": "public, max-age=86400", ...VARY } });
    } catch (error) {
      console.error("[brand/og] lookup failed", error);
    }
  }
  const svg = await draw();
  try {
    const { svgToPng } = await import("@/lib/og-render.server");
    const png = await svgToPng(svg, origin, "#0E0D0C", square ? 1080 : 1200);
    if (stored) s3.putObject("internal", key, png, { contentType: "image/png" }).catch((e) => console.error("[brand/og] upload failed", e));
    return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": LONG_CACHE, ...VARY } });
  } catch (error) {
    console.error("[brand/og] render failed", error);
    // A .png URL must stay a PNG for crawlers: fall back to the home card (or SVG as last resort), uncached.
    if (fallback) return new Response(null, { status: 302, headers: { location: fallback, "cache-control": "no-store" } });
    return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "no-store" } });
  }
}
