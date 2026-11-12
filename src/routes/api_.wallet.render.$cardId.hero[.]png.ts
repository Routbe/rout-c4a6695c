import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/wallet/render/<card>/hero.png — hero image Google Wallet fetches for a
 * ROUT Card. <card> is a public handle (`u-<handle>` for alias cards). Public
 * card data only; unknown or private cards are 404.
 */
export const Route = createFileRoute("/api_/wallet/render/$cardId/hero.png")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const raw = String(params.cardId ?? "").toLowerCase();
        const alias = raw.startsWith("u-");
        const handle = alias ? raw.slice(2) : raw;
        if (!/^[a-z0-9._-]{1,100}$/.test(handle)) return new Response("Invalid card", { status: 400 });
        const { generateWalletPayload, walletOrigin } = await import("@/lib/wallet/wallet-payload.server");
        const card = await generateWalletPayload(handle, { space: alias ? "alias" : "root" });
        if (!card) return new Response("Not found", { status: 404, headers: { "cache-control": "public, max-age=60" } });
        const { walletHeroSvg } = await import("@/lib/wallet/wallet-art");
        const { svgToPng } = await import("@/lib/og-render.server");
        const svg = walletHeroSvg({
          displayName: card.displayName, handle: card.handle, sovereignId: card.sovereignId,
          bg: card.hexBackgroundColor, accent: card.accentHex ?? "#41db97", fg: card.hexForegroundColor, space: card.space,
        });
        const png = await svgToPng(svg, walletOrigin(), card.hexBackgroundColor, 3096);
        // walletHeroUrl versions this URL (?v=) by design, so the bytes behind a URL never change.
        const { WALLET_IMAGE_HEADERS } = await import("@/lib/wallet/wallet-image-headers");
        return new Response(png as BodyInit, { headers: WALLET_IMAGE_HEADERS });
      },
    },
  },
});
