import { createFileRoute } from "@tanstack/react-router";

/**
 * Public health probe used by the status widget in the footer.
 *
 * Deliberately privacy-clean: nothing about the caller is read, stored or
 * logged — the handler only reports whether the app can reach its Neon
 * Postgres database and how long that round-trip took.
 */
export const Route = createFileRoute("/api_/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const started = Date.now();
        let status: "operational" | "degraded" = "operational";

        try {
          const { sql } = await import("@/lib/neon");
          await sql`SELECT 1`;
        } catch {
          status = "degraded";
        }

        return Response.json(
          { status, latency_ms: Date.now() - started },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
