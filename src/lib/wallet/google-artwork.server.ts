import { googleArtworkVersion, googlePremiumArtworkSvg, GOOGLE_PASS_DESIGN } from "./google-premium-art";

/** Public handles only: never export artwork for a private or unknown profile. */
export async function renderGoogleArtwork(cardId: string, version: string, file: string): Promise<Response> {
  if (file !== "hero.png") return new Response("Not found", { status: 404 });
  const alias = cardId.startsWith("u-");
  const handle = alias ? cardId.slice(2) : cardId;
  if (!/^[a-z0-9._-]{1,100}$/.test(handle)) return new Response("Invalid card", { status: 400 });
  const { generateWalletPayload, walletOrigin } = await import("./wallet-payload.server");
  const card = await generateWalletPayload(handle, { space: alias ? "alias" : "root" });
  if (!card || googleArtworkVersion(card) !== version) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  const { svgToPng } = await import("@/lib/og-render.server");
  // Transparent PNG: Google shows the pass tile colour through the artwork.
  const png = await svgToPng(googlePremiumArtworkSvg(card), walletOrigin(), "transparent", GOOGLE_PASS_DESIGN.heroWidth);
  const { WALLET_IMAGE_HEADERS } = await import("./wallet-image-headers");
  return new Response(png as BodyInit, { headers: WALLET_IMAGE_HEADERS });
}
