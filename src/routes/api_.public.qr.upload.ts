import { createFileRoute } from "@tanstack/react-router";

/**
 * Upload for "share a file via QR". Requires a logged-in ROUT session (same-origin
 * cookie). Stores the file privately in the Scaleway client bucket with an
 * expiry and returns the short download link `/f/<id>`.
 */
export const Route = createFileRoute("/api_/public/qr/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { guardRequest } = await import("@/lib/api-guard.server");
        const limited = guardRequest(request, "qr-upload", 20, 60000);
        if (limited) return limited;
        const { guardShared } = await import("@/lib/rate-limit-db.server");
        const { RATE_RULES } = await import("@/lib/rate-limit-rules");
        const shared = await guardShared(request, "qr-upload", RATE_RULES.qrUpload);
        if (shared) return shared;

        const { currentUser } = await import("@/lib/auth/session.server");
        const user = await currentUser().catch(() => null);
        if (!user) return Response.json({ error: "Log in om bestanden te delen." }, { status: 401 });

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return Response.json({ error: "Ongeldige upload." }, { status: 400 });
        }
        const file = form.get("file");
        if (!(file instanceof File)) return Response.json({ error: "Geen bestand ontvangen." }, { status: 400 });
        const days = Number(form.get("days") ?? 7);
        const { checkActiveScopeUpload } = await import("@/lib/entitlement-engine.server");
        const quota = await checkActiveScopeUpload(user.id, file.size).catch(() => ({ ok: false as const, status: 403 as const, error: "Storage Quota Exceeded" }));
        if (!quota.ok) return Response.json({ error: quota.error }, { status: quota.status });

        try {
          const { createSharedFile } = await import("@/lib/storage/shared-files.server");
          const bytes = new Uint8Array(await file.arrayBuffer());
          const { id, expiresAt } = await createSharedFile({ userId: user.id, bytes, fileName: file.name, days });
          const origin = new URL(request.url).origin;
          return Response.json({ url: `${origin}/f/${id}`, expiresAt });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Upload mislukt.";
          console.error("[qr-upload]", message);
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
