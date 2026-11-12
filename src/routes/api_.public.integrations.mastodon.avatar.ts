import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api_/public/integrations/mastodon/avatar")({
  server: { handlers: { GET: async ({ request }) => {
    const handle = new URL(request.url).searchParams.get("handle") ?? "";
    if (handle.length > 320) return new Response("Invalid handle", { status: 400 });
    try {
      const { cachedMastodonAvatar } = await import("@/lib/integrations/mastodon.server");
      return await cachedMastodonAvatar(handle);
    } catch (error) {
      const status = (error as { status?: number }).status;
      return new Response("Avatar unavailable", { status: status && [400, 413, 415].includes(status) ? status : 502, headers: { "cache-control": "no-store" } });
    }
  } } },
});