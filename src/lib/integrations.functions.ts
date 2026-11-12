import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

/** The caller's hub state: saved connections + handles proven by sign-in. */
export const getMyIntegrations = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const s = await import("./integrations.server");
    try {
      const [items, sso] = await Promise.all([s.listMine(context.userId), s.ssoHandles(context.userId)]);
      return { ready: true, items, sso };
    } catch (e) {
      console.error("[integrations] list failed", e instanceof Error ? e.message : e);
      return { ready: false, items: [], sso: {} as Record<string, string> };
    }
  });

const saveSchema = z.object({
  provider: z.string().regex(/^[a-z0-9_]{2,32}$/),
  handle: z.string().trim().max(200).optional(),
  audience: z.enum(["pro", "social", "both"]),
  visible: z.boolean(),
  useSso: z.boolean().optional(),
  showOnVerified: z.boolean().optional(),
  showOnAlias: z.boolean().optional(),
});

export const saveIntegration = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const s = await import("./integrations.server");
    try {
      return { ok: true as const, item: await s.saveMine(context.userId, data) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "invalid_value" || msg === "unsupported_provider") return { ok: false as const, error: msg };
      console.error("[integrations] save failed", msg);
      return { ok: false as const, error: "save_failed" };
    }
  });

export const removeIntegration = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ provider: z.string().regex(/^[a-z0-9_]{2,32}$/) }).parse(input))
  .handler(async ({ data, context }) => {
    const s = await import("./integrations.server");
    await s.removeMine(context.userId, data.provider);
    return { ok: true };
  });

const verifySchema = z.object({ provider: z.enum(["bluesky", "wsocial", "mastodon", "github", "chesscom"]) });

/** Bio-check step 1: issue a temporary code for the caller's own connection. */
export const startIntegrationVerify = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => verifySchema.parse(input))
  .handler(async ({ data, context }) => {
    const s = await import("./integrations.server");
    try {
      return { ok: true as const, code: await s.startBioVerify(context.userId, data.provider) };
    } catch (e) {
      console.error("[integrations] verify start failed", e instanceof Error ? e.message : e);
      return { ok: false as const, code: null };
    }
  });

/** Bio-check step 2: read the live public bio and mark verified when the code is present. */
export const checkIntegrationVerify = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => verifySchema.parse(input))
  .handler(async ({ data, context }) => {
    const s = await import("./integrations.server");
    try {
      return { result: await s.checkBioVerify(context.userId, data.provider) };
    } catch (e) {
      console.error("[integrations] verify check failed", e instanceof Error ? e.message : e);
      return { result: "unreachable" as const };
    }
  });

/** The caller's own ROUT username, for the "rout.be/<username>" bio link. */
export const getMyRoutUsername = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { sql } = await import("@/lib/neon");
    const rows = (await sql`select username from public.profiles where id = ${context.userId} limit 1`) as { username: string | null }[];
    return { username: rows[0]?.username ?? null };
  });
