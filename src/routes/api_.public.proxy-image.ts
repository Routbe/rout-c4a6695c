import { createFileRoute } from "@tanstack/react-router";

/**
 * Privacy proxy: visitors load third-party images through ROUT, so their IP
 * and cookies never reach the image host. Allowlisted hosts only.
 */
export const Route = createFileRoute("/api_/public/proxy-image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { guardRequest } = await import("@/lib/api-guard.server");
        const limited = guardRequest(request, "proxy-image", 300, 60000);
        if (limited) return limited;
        const { isAllowedProxyUrl } = await import("@/lib/image-proxy-rules");
        const region = process.env.SCALEWAY_REGION || process.env.S3_REGION || "fr-par";
        const bucket = process.env.SCALEWAY_CLIENT_BUCKET || process.env.SCALEWAY_DEFAULT_BUCKET || process.env.S3_BUCKET_NAME;
        const storageHosts = bucket ? [`${bucket}.s3.${region}.scw.cloud`] : [];
        const target = isAllowedProxyUrl(new URL(request.url).searchParams.get("url") ?? "", storageHosts);
        if (!target) return new Response("Not allowed", { status: 400 });
        try {
          const { validateOutboundUrl } = await import("@/lib/security/ssrf-guard.server");
          await validateOutboundUrl(target.toString(), AbortSignal.timeout(3000));
          const { readPublicImage } = await import("@/lib/public-image.server");
          const response = await readPublicImage(target.toString());
          if (response.ok) return response;
          const { unavailableImageResponse } = await import("@/lib/image-placeholder");
          return unavailableImageResponse();
        } catch (error) {
          const status = (error as { status?: number }).status;
          if (status === 400 || status === 413 || status === 415) return new Response("Image request refused", { status });
          const { unavailableImageResponse } = await import("@/lib/image-placeholder");
          return unavailableImageResponse();
        }
      },
    },
  },
});
