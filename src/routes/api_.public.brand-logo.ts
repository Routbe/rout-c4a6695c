import { createFileRoute } from "@tanstack/react-router";

/**
 * CORS-enabled favicon proxy.
 *
 * The QR renderer inlines the centre logo through the DOM, so it needs an
 * image served with CORS headers — favicon CDNs send none. This route fetches
 * the icon server-side and re-serves it same-origin.
 */
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export const Route = createFileRoute("/api_/public/brand-logo")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { guardRequest } = await import("@/lib/api-guard.server");
        const limited = guardRequest(request, "brand-logo", 120, 60000);
        if (limited) return limited;

        const domain = (new URL(request.url).searchParams.get("domain") ?? "")
          .toLowerCase()
          .replace(/^www\./, "");
        if (!domain || domain.length > 253 || !DOMAIN_RE.test(domain)) {
          return new Response("Invalid domain", { status: 400 });
        }

        /**
         * Drietrapsraket: DuckDuckGo → Google favicon (256px) → Unavatar.
         * Zolang één bron een echte afbeelding levert, is dit geen fout.
         */
        const sources = [
          `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`,
          `https://www.google.com/s2/favicons?sz=256&domain=${encodeURIComponent(domain)}`,
          `https://unavatar.io/${encodeURIComponent(domain)}?fallback=false`,
        ];

        for (const source of sources) {
          try {
            const upstream = await fetch(source, { headers: { accept: "image/*" } });
            const type = upstream.headers.get("content-type") ?? "";
            if (!upstream.ok || !type.startsWith("image/")) continue;
            const bytes = await upstream.arrayBuffer();
            if (bytes.byteLength < 64) continue;
            return new Response(bytes, {
              status: 200,
              headers: {
                "content-type": type,
                "cache-control": "public, max-age=86400",
                "access-control-allow-origin": "*",
              },
            });
          } catch {
            // Volgende bron proberen.
          }
        }
        return new Response("Not found", { status: 404 });
      },
    },
  },
});
