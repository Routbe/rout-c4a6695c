import { createFileRoute } from "@tanstack/react-router";

/** YouTube PubSubHubbub callback: GET = subscription verify, POST = signed Atom push. */
export const Route = createFileRoute("/api_/public/youtube/push")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams;
        const challenge = q.get("hub.challenge") ?? "";
        const topic = q.get("hub.topic") ?? "";
        const mode = q.get("hub.mode");
        if (!challenge || challenge.length > 200 || (mode !== "subscribe" && mode !== "unsubscribe")) {
          return new Response("Bad request", { status: 400 });
        }
        const y = await import("@/lib/youtube.server");
        if (!(await y.isKnownYouTubeTopic(topic, q.get("t") ?? "").catch(() => false))) {
          return new Response("Not found", { status: 404 });
        }
        return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
      },
      POST: async ({ request }) => {
        const body = await request.text();
        if (body.length > 200_000) return new Response("Too large", { status: 413 });
        try {
          const y = await import("@/lib/youtube.server");
          const status = await y.handleYouTubePush(body, request.headers.get("x-hub-signature"));
          return new Response(null, { status });
        } catch (e) {
          console.error("[youtube-push]", e instanceof Error ? e.message : "unknown");
          return new Response(null, { status: 204 });
        }
      },
    },
  },
});
