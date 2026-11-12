import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";

/** One round-trip overview for the active scope (personal or workspace). */
export const getDashboardOverview = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { sql } = await import("@/lib/neon");
    const { resolveActiveWorkspace } = await import("./workspaces.server");
    const { trackedQrScopeSql, scanTrend } = await import("./dashboard-scope");
    const { workspaceId } = await resolveActiveWorkspace(context.userId);
    const { dashboardCache } = await import("./dashboard-cache");
    return dashboardCache.get(`${context.userId}:${workspaceId ?? "personal"}`, async () => {
    const f = trackedQrScopeSql({ userId: context.userId, workspaceId });
    const rows = (await sql.query(
      `with t as (select t.id from public.tracked_qrs t where ${f.where}),
            s as (select q.scanned_at from public.qr_scans q join t on t.id = q.tracked_qr_id)
       select (select count(*) from t)::int as tracked,
              (select count(*) from s)::int as scans,
              (select count(*) from public.saved_qrs where user_id = $2)::int as saved,
              coalesce((select json_agg(json_build_object('day', d, 'n', n)) from (
                 select date_trunc('day', scanned_at) as d, count(*)::int as n from s
                 where scanned_at >= now() - interval '14 days' group by 1) x), '[]'::json) as days`,
      [...f.params, context.userId],
    )) as { tracked: number; scans: number; saved: number; days: { day: string; n: number }[] }[];
    const r = rows[0] ?? { tracked: 0, scans: 0, saved: 0, days: [] };
    return { saved: workspaceId ? 0 : r.saved, tracked: r.tracked, scans: r.scans, trend: scanTrend(r.days) };
    });
  });
