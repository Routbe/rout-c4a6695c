import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/api_/public/weather")({
  server: { handlers: { GET: async ({ request }) => {
    const parsed = z.object({ handle: z.string().min(1).max(64).regex(/^[\p{L}\d_.@-]+$/u), alias: z.enum(["true", "false"]).default("false") }).safeParse(Object.fromEntries(new URL(request.url).searchParams));
    const headers = { "cache-control": "private, no-store" };
    if (!parsed.success) return Response.json({ state: null }, { status: 400, headers });
    try {
      const s = await import("@/lib/ambient-weather.server");
      return Response.json({ state: await s.publicProfileWeather(parsed.data.handle.replace(/^@/, ""), parsed.data.alias === "true") }, { headers });
    } catch (error) {
      console.error("[ambient-weather] public read unavailable", error instanceof Error ? error.message : "unknown");
      return Response.json({ state: null }, { status: 503, headers });
    }
  } } },
});