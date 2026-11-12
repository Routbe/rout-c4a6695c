import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/upload/presign { scope: "personal" | "workspace", workspaceId?, contentType, size, fileName }
 * Validates the session, scope membership, plan and overrides before handing out a short-lived upload URL.
 */
export const Route = createFileRoute("/api_/upload/presign")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { currentUser } = await import("@/lib/auth/session.server");
        const user = await currentUser().catch(() => null);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        const contentType = typeof body?.["contentType"] === "string" ? body["contentType"] : "";
        const size = Number(body?.["size"] ?? 0);
        const { SHARE_TYPES, MAX_UPLOAD_BYTES, extFor, presignedPutUrl, storageConfigured } = await import("@/lib/storage/s3.server");
        const allowed = [...SHARE_TYPES, "video/mp4", "video/webm"] as string[];
        if (!allowed.includes(contentType) || !Number.isFinite(size) || size <= 0) {
          return Response.json({ error: "Invalid file" }, { status: 400 });
        }
        const { isUuid } = await import("@/lib/workspaces.server");
        const wsId = body?.["workspaceId"];
        const scope = body?.["scope"] === "workspace" && isUuid(wsId)
          ? ({ type: "workspace", id: wsId } as const)
          : ({ type: "user", id: user.id } as const);
        if (body?.["scope"] === "workspace" && scope.type !== "workspace") return Response.json({ error: "Invalid scope" }, { status: 400 });

        const engine = await import("@/lib/entitlement-engine.server");
        try {
          await engine.assertScopeAccess(user.id, scope);
        } catch {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        const { decidePresign } = await import("@/lib/entitlement-engine");
        const decision = decidePresign(await engine.loadScopeInput(scope), await engine.scopeUsedBytes(scope), size);
        if (!decision.ok) return Response.json({ error: decision.error }, { status: 403 });
        if (size > MAX_UPLOAD_BYTES * 20) return Response.json({ error: "File too large" }, { status: 413 });
        if (!storageConfigured("client")) return Response.json({ error: "Storage not configured" }, { status: 503 });

        const prefix = scope.type === "user" ? `u/${user.id}` : `w/${scope.id}`;
        const key = `${prefix}/drafts/${crypto.randomUUID()}.${extFor(contentType) === "bin" ? contentType.split("/")[1] : extFor(contentType)}`;
        const url = await presignedPutUrl("client", key, contentType);
        return Response.json({ url, key, method: "PUT", headers: { "content-type": contentType } });
      },
    },
  },
});
