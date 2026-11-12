import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";
import { normalizePresence, type PresenceStatus } from "@/lib/avatar-decorations";

export type QuickPresence = { presence: PresenceStatus; statusLine: string | null; pulseRing: boolean };

function clean(input: Partial<QuickPresence> | undefined): QuickPresence {
  const line = typeof input?.statusLine === "string" ? input.statusLine.trim().slice(0, 60) : "";
  return { presence: normalizePresence(input?.presence), statusLine: line || null, pulseRing: input?.pulseRing !== false };
}

/** Command Center: the caller's published Live Presence (dot, bubble, Pulse ring). */
export const getQuickPresence = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { sql } = await import("@/lib/neon");
    const rows = await sql`select username, display_prefs from public.profiles where id = ${context.userId}`;
    const row = rows[0] as { username: string | null; display_prefs: Record<string, unknown> | null } | undefined;
    return { handle: row?.username ?? null, ...clean((row?.display_prefs ?? {}) as Partial<QuickPresence>) };
  });

/** Live status is instant: publish only these three keys and patch the private draft (revision bump refuses stale editors). */
export const setQuickPresence = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: Partial<QuickPresence>) => clean(input))
  .handler(async ({ data, context }) => {
    const { sql } = await import("@/lib/neon");
    const patch = JSON.stringify(data);
    const results = await sql.transaction([
      sql`update public.profiles set display_prefs = coalesce(display_prefs, '{}'::jsonb) || ${patch}::jsonb where id = ${context.userId} returning id`,
      sql`update public.profile_drafts
        set payload = jsonb_set(payload, '{displayPrefs}', coalesce(payload->'displayPrefs', '{}'::jsonb) || ${patch}::jsonb, true),
            revision = revision + 1,
            published_revision = case when published_revision = revision then revision + 1 else published_revision end,
            updated_at = now()
        where user_id = ${context.userId}`,
    ]);
    if (!results[0]?.length) throw new Error("profile_not_found");
    return data;
  });
