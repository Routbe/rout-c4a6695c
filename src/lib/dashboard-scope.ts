/** Pure scope rule for dashboard statistics: a workspace sees only its QR codes, personal sees only non-workspace ones. */
export type DashboardScope = { userId: string; workspaceId: string | null };

export function trackedQrScopeSql(scope: DashboardScope): { where: string; params: [string] } {
  return scope.workspaceId
    ? { where: "t.workspace_id = $1", params: [scope.workspaceId] }
    : { where: "t.user_id = $1 and t.workspace_id is null", params: [scope.userId] };
}

/** Buckets scan timestamps into a 14-day trend ending today (index 13). */
export function scanTrend(days: { day: string; n: number }[], now: Date = new Date()): number[] {
  const since = new Date(now.getTime() - 13 * 86400000);
  since.setHours(0, 0, 0, 0);
  const trend = new Array(14).fill(0) as number[];
  for (const d of days) {
    const i = Math.floor((new Date(d.day).getTime() - since.getTime()) / 86400000);
    if (i >= 0 && i < 14) trend[i] += d.n;
  }
  return trend;
}
