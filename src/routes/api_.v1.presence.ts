import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/v1/presence — set a custom live status from Raycast, Shortcuts, Home Assistant or cURL.
 * Auth: `Authorization: Bearer rp_…` (per-member presence API key). DELETE clears the status.
 */
async function authed(request: Request): Promise<string | Response> {
  const { guardRequest } = await import("@/lib/api-guard.server");
  const limited = guardRequest(request, "presence-ingest", 30, 60000);
  if (limited) return limited;
  const key = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const { userForPresenceKey } = await import("@/lib/custom-presence.server");
  const userId = await userForPresenceKey(key).catch(() => null);
  return userId ?? Response.json({ error: "Invalid presence API key" }, { status: 401 });
}

export const Route = createFileRoute("/api_/v1/presence")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await authed(request);
        if (userId instanceof Response) return userId;
        const { presencePayloadSchema } = await import("@/lib/custom-presence");
        const parsed = presencePayloadSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Invalid payload", issues: parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message) }, { status: 400 });
        const { setCustomStatus } = await import("@/lib/custom-presence.server");
        const { expiresAt } = await setCustomStatus(userId, parsed.data);
        return Response.json({ ok: true, expires_at: expiresAt });
      },
      DELETE: async ({ request }) => {
        const userId = await authed(request);
        if (userId instanceof Response) return userId;
        const { clearCustomStatus } = await import("@/lib/custom-presence.server");
        await clearCustomStatus(userId);
        return Response.json({ ok: true });
      },
    },
  },
});
