import { createFileRoute } from "@tanstack/react-router";

/**
 * Lichtgewicht beschikbaarheidscheck voor handles.
 *
 * Geeft uitsluitend `available` + reden terug — nooit wie de handle bezit, dus
 * er lekt geen enkel profielgegeven. Wordt debounced (300 ms) aangeroepen door
 * het handle-veld in de profielinstellingen.
 */
export const Route = createFileRoute("/api_/profiles/check-handle")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { guardRequest } = await import("@/lib/api-guard.server");
        const limited = guardRequest(request, "check-handle", 60, 60000);
        if (limited) return limited;

        const url = new URL(request.url);
        const raw = (url.searchParams.get("handle") ?? "").slice(0, 64);

        const { normalizeHandleForStorage } = await import("@/lib/handle-rules");
        const handle = normalizeHandleForStorage(raw);
        if (!handle) {
          return Response.json({ handle: "", available: false, reason: "invalid" });
        }

        // Eigen handle mag "vrij" heten voor de ingelogde eigenaar.
        const { currentUser } = await import("@/lib/auth/session.server");
        const user = await currentUser().catch(() => null);

        try {
          const { isHandleFree } = await import("@/lib/studio-profile.server");
          const result = await isHandleFree(handle, user?.id ?? null);
          return Response.json(
            { handle, available: result.ok, reason: result.reason },
            { headers: { "Cache-Control": "no-store" } },
          );
        } catch (error) {
          console.error("[profiles:check-handle]", error);
          return Response.json({ handle, available: false, reason: "error" }, { status: 502 });
        }
      },
    },
  },
});
