import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/email/unsubscribe")({
  server: { handlers: {
    // Email scanners follow GET: never change preferences here.
    GET: () => new Response("Gebruik de afmeldknop van je mailclient om ROUT-meldingen te stoppen.", {
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" },
    }),
    POST: async ({ request }) => {
      if (!(request.headers.get("content-type") ?? "").startsWith("application/x-www-form-urlencoded")) return new Response("Unsupported content type", { status: 415 });
      if (Number(request.headers.get("content-length") ?? 0) > 1024) return new Response("Too large", { status: 413 });
      const text = await request.text();
      if (text.length > 1024) return new Response("Too large", { status: 413 });
      if (new URLSearchParams(text).get("List-Unsubscribe") !== "One-Click") return new Response("Invalid request", { status: 400 });
      const { unsubscribeNotifications } = await import("@/lib/email/unsubscribe.server");
      const ok = await unsubscribeNotifications(new URL(request.url).searchParams.get("token") ?? "");
      return new Response(ok ? "Afmeldbare ROUT-meldingen gestopt." : "Invalid token", { status: ok ? 200 : 403, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
    },
  } },
});