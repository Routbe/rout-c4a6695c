import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api_/wallet/render/$cardId/$version/$file")({
  server: { handlers: { GET: async ({ params }) => {
    const { renderGoogleArtwork } = await import("@/lib/wallet/google-artwork.server");
    return renderGoogleArtwork(params.cardId, params.version, params.file);
  } } },
});