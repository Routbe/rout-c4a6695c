import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";
import { showcaseDisplay, type ShowcaseDisplay } from "./showcase-display";

const FALLBACK = ["maximilien.brussels"];
const handleSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/^@/, "").replace(/^https?:\/\/(www\.)?rout\.be\//i, "").replace(/^u\//, "").toLowerCase())
  .pipe(z.string().regex(/^[a-z0-9._-]{1,64}$/));

async function db() {
  const { sql } = await import("@/lib/neon");
  return sql;
}

/** Public: handles to render as live phone previews. */
export const listShowcaseHandles = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const sql = await db();
    const rows = (await sql`select handle from public.showcase_profiles order by position, created_at`) as { handle: string }[];
    return rows.length ? rows.map((r) => r.handle) : FALLBACK;
  } catch (e) {
    console.warn("[showcase] list failed", e);
    return FALLBACK;
  }
});

/** Admin: replace the full ordered list. */
export const saveShowcaseHandles = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ handles: z.array(handleSchema).max(20) }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const sql = await db();
    const unique = [...new Set(data.handles)];
    await sql`delete from public.showcase_profiles`;
    for (let i = 0; i < unique.length; i++) {
      await sql`insert into public.showcase_profiles (handle, position) values (${unique[i]}, ${i})`;
    }
    return unique;
  });

export type ShowcaseCard = {
  handle: string;
  displayName: string | null;
  tagline: string | null;
  bio: string | null;
  avatarUrl: string | null;
  verified: boolean;
  theme?: string;
  display?: ShowcaseDisplay;
};

/** Public: snapshot data for the /explore bento grid (private profiles are skipped). */
export const listShowcaseCards = createServerFn({ method: "GET" }).handler(async (): Promise<ShowcaseCard[]> => {
  const handles = await listShowcaseHandles();
  if (!handles.length) return [];
  try {
    const { sql } = await import("@/lib/neon");
    const rows = (await sql`
      select username, display_name, tagline, bio, avatar_url, coalesce(verified, false) as verified, display_prefs,
             theme, is_business, is_influencer, subdomain_alias
        from public.profiles where lower(username) = any(${handles})
    `) as Record<string, unknown>[];
    const byHandle = new Map(rows.map((r) => [String(r["username"]).toLowerCase(), r]));
    return handles.flatMap((h) => {
      const r = byHandle.get(h);
      if (!r) return [];
      const prefs = (r["display_prefs"] ?? {}) as Record<string, unknown>;
      if (prefs["publicProfile"] === false) return [];
      return [{
        handle: h,
        displayName: (r["display_name"] as string | null) ?? null,
        tagline: (r["tagline"] as string | null) ?? null,
        bio: (r["bio"] as string | null) ?? null,
        avatarUrl: (r["avatar_url"] as string | null) ?? null,
        verified: Boolean(r["verified"]),
        theme: String(r["theme"] ?? ""),
        display: showcaseDisplay(prefs, Boolean(r["is_business"]), Boolean(r["is_influencer"]), /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(String(r["subdomain_alias"] ?? ""))),
      }];
    });
  } catch (e) {
    console.warn("[showcase] cards failed", e);
    return handles.map((h) => ({ handle: h, displayName: null, tagline: null, bio: null, avatarUrl: null, verified: false }));
  }
});
