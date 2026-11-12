import { createServerFn } from "@tanstack/react-start";

export type CommunityStats = { members: number; verified: number };
export type CommunityReview = { id: string; authorName: string; handle: string | null; quote: string };

/** Public: real aggregate counts only. Returns null when the database is unreachable. */
export const getCommunityStats = createServerFn({ method: "GET" }).handler(
  async (): Promise<CommunityStats | null> => {
    try {
      const { sql } = await import("@/lib/neon");
      const rows = (await sql`
        select count(*)::int as members,
               count(*) filter (where coalesce(verified, false))::int as verified
          from public.profiles where username is not null
      `) as { members: number; verified: number }[];
      const r = rows[0];
      return r ? { members: Number(r.members) || 0, verified: Number(r.verified) || 0 } : null;
    } catch {
      return null;
    }
  },
);

/** Public: admin-approved reviews only. Empty list when none exist (or the table is missing). */
export const listApprovedReviews = createServerFn({ method: "GET" }).handler(
  async (): Promise<CommunityReview[]> => {
    try {
      const { sql } = await import("@/lib/neon");
      const rows = (await sql`
        select id, author_name, handle, quote from public.community_reviews
         where status = 'approved' order by approved_at desc nulls last limit 12
      `) as Record<string, unknown>[];
      return rows.map((r) => ({
        id: String(r["id"]),
        authorName: String(r["author_name"] ?? ""),
        handle: typeof r["handle"] === "string" ? r["handle"] : null,
        quote: String(r["quote"] ?? ""),
      }));
    } catch {
      return [];
    }
  },
);
