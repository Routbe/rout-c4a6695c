import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";

type WsInput = { workspaceId: string };

export const getWorkspaceSocial = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((i: WsInput) => i)
  .handler(async ({ data, context }) => {
    const m = await import("./workspace-social.server");
    return m.listWorkspaceSocial(context.userId, data.workspaceId);
  });

export const saveWorkspaceSocial = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: WsInput & { platform: string; username: string }) => i)
  .handler(async ({ data, context }) => {
    const m = await import("./workspace-social.server");
    try {
      const link = await m.upsertWorkspaceSocial(context.userId, data.workspaceId, data.platform, data.username);
      return { ok: true as const, link, reason: null };
    } catch (e) {
      return { ok: false as const, link: null, reason: e instanceof Error ? e.message : "save_failed" };
    }
  });

export const removeWorkspaceSocial = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: WsInput & { id: string }) => i)
  .handler(async ({ data, context }) => {
    const m = await import("./workspace-social.server");
    return m.deleteWorkspaceSocial(context.userId, data.workspaceId, data.id);
  });

export const verifyWorkspaceSocialLink = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: WsInput & { id: string }) => i)
  .handler(async ({ data, context }) => {
    const m = await import("./workspace-social.server");
    return m.verifyWorkspaceSocial(context.userId, data.workspaceId, data.id);
  });

export const getWorkspaceBluesky = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((i: WsInput) => i)
  .handler(async ({ data, context }) => {
    const m = await import("./workspace-social.server");
    return m.readWorkspaceBluesky(context.userId, data.workspaceId);
  });

export const linkWorkspaceBlueskyHandle = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((i: WsInput & { handle: string | null }) => ({
    workspaceId: String(i.workspaceId),
    handle: i.handle ? String(i.handle).slice(0, 253) : null,
  }))
  .handler(async ({ data, context }) => {
    const m = await import("./workspace-social.server");
    try {
      return await m.linkWorkspaceBluesky(context.userId, data.workspaceId, data.handle);
    } catch {
      return { ok: false as const, error: "Geen rechten of tijdelijk niet bereikbaar." };
    }
  });
