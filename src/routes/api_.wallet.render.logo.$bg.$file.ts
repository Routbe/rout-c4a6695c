import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/wallet/render/logo/<bg hex>/<rout|light|dark>.png — 660² official ROUT
 * badge (bunny in purple + mint rings) inside Google's circular safe area.
 * `rout.png` picks the bunny tone by contrast. Immutable per URL.
 */
export const Route = createFileRoute("/api_/wallet/render/logo/$bg/$file")({
  server: { handlers: { GET: async ({ params }) => {
    const bg = String(params.bg ?? "").toLowerCase();
    const file = String(params.file);
    if (!/^[0-9a-f]{6}$/.test(bg) || !["rout.png", "light.png", "dark.png"].includes(file)) return new Response("Not found", { status: 404 });
    const { googlePremiumLogoSvg, GOOGLE_PASS_DESIGN } = await import("@/lib/wallet/google-premium-art");
    const { pickLogoTone } = await import("@/lib/wallet/wallet-color");
    const tone = file === "light.png" ? "light" : file === "dark.png" ? "dark" : pickLogoTone(`#${bg}`);
    const { svgToPng } = await import("@/lib/og-render.server");
    const { walletOrigin } = await import("@/lib/wallet/wallet-payload.server");
    const png = await svgToPng(googlePremiumLogoSvg(`#${bg}`, tone), walletOrigin(), `#${bg}`, GOOGLE_PASS_DESIGN.logoSize);
    const { WALLET_IMAGE_HEADERS } = await import("@/lib/wallet/wallet-image-headers");
    return new Response(png as BodyInit, { headers: WALLET_IMAGE_HEADERS });
  } } },
});
