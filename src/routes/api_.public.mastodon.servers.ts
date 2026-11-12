import { createFileRoute } from "@tanstack/react-router";

let cache: { at: number; servers: string[] } | null = null;

async function liveServers(): Promise<string[]> {
  if (cache && Date.now() - cache.at < 6 * 60 * 60 * 1000) return cache.servers;
  try {
    const res = await fetch("https://api.joinmastodon.org/servers?language=&category=general", {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const rows = (await res.json()) as { domain?: string }[];
    const servers = rows.map((r) => r.domain).filter((d): d is string => typeof d === "string").slice(0, 300);
    cache = { at: Date.now(), servers };
    return servers;
  } catch {
    return cache?.servers ?? [];
  }
}

/** Public, read-only server suggestions for the Mastodon sign-in field. */
export const Route = createFileRoute("/api_/public/mastodon/servers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { filterMastodonServers } = await import("@/lib/mastodon-servers");
        const q = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 100);
        const servers = filterMastodonServers(q, await liveServers(), 8);
        return Response.json(
          { servers },
          { headers: { "cache-control": "public, max-age=600" } },
        );
      },
    },
  },
});
