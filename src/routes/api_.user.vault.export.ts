import { createFileRoute } from "@tanstack/react-router";

/** GET /api/user/vault/export — ZIP of the signed-in member's own data. */
export const Route = createFileRoute("/api_/user/vault/export")({
  server: {
    handlers: {
      GET: async () => {
        const { currentUser } = await import("@/lib/auth/session.server");
        const user = await currentUser().catch(() => null);
        if (!user) return new Response("Unauthorized", { status: 401 });
        const { ensureStepUpSession, StepUpRequiredError } = await import("@/lib/auth/step-up.server");
        try {
          await ensureStepUpSession(user.id, "vault_export");
        } catch (e) {
          if (e instanceof StepUpRequiredError) return new Response("Step-Up Required", { status: 401 });
          throw e;
        }
        const { hitRateLimit } = await import("@/lib/rate-limit-db.server");
        const limit = await hitRateLimit("vault-export", user.id, { limit: 5, windowSec: 3600 });
        if (!limit.ok) return new Response("Too many exports, try again later", { status: 429 });
        const { buildVaultZip } = await import("@/lib/vault-export.server");
        const body = await buildVaultZip(user.id);
        return new Response(body as unknown as BodyInit, {
          headers: {
            "content-type": "application/zip",
            "content-disposition": `attachment; filename="rout-vault-${new Date().toISOString().slice(0, 10)}.zip"`,
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
