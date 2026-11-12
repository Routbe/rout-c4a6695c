/**
 * Cursor (keyset) pagination for the admin audit log.
 *
 * Offset pagination re-scans every skipped row and can skip or duplicate
 * entries when new audit rows land mid-browse. Keyset pagination anchors on
 * (created_at, id) so each page is O(page size) and always consistent.
 */
import { assertServiceRole } from "./deployment-status.server";

export type AuditCursorRow = {
  id: string;
  adminEmail: string | null;
  action: string;
  targetUserId: string | null;
  targetLabel: string | null;
  notes: string | null;
  createdAt: string;
};

export type AuditCursorFilters = {
  adminEmail?: string;
  action?: string;
  from?: string;
  to?: string;
  search?: string;
};

export function encodeCursor(row: { createdAt: string; id: string }): string {
  return Buffer.from(`${row.createdAt}|${row.id}`, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const [createdAt, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    if (!createdAt || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

export async function fetchAuditCursorPage(opts: {
  filters?: AuditCursorFilters;
  cursor?: string | null;
  perPage?: number;
}): Promise<{
  rows: AuditCursorRow[];
  nextCursor: string | null;
  hasMore: boolean;
  perPage: number;
}> {
  assertServiceRole();
  const { dbAdmin } = await import("@/lib/db/admin.server");

  const filters = opts.filters ?? {};
  const perPage = Math.min(100, Math.max(10, opts.perPage ?? 20));

  let q = dbAdmin
    .from("admin_audit_log")
    .select("id, admin_email, action, target_user_id, target_label, notes, created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(perPage + 1);

  if (filters.adminEmail) q = q.ilike("admin_email", `%${filters.adminEmail}%`);
  if (filters.search) {
    const term = filters.search.replace(/[,()]/g, " ").trim();
    if (term) {
      q = q.or(
        [
          `action.ilike.%${term}%`,
          `admin_email.ilike.%${term}%`,
          `target_label.ilike.%${term}%`,
          `notes.ilike.%${term}%`,
        ].join(","),
      );
    }
  }
  if (filters.action) q = q.eq("action", filters.action);
  if (filters.from) q = q.gte("created_at", new Date(filters.from).toISOString());
  if (filters.to) {
    const to = new Date(filters.to);
    to.setHours(23, 59, 59, 999);
    q = q.lte("created_at", to.toISOString());
  }

  const anchor = opts.cursor ? decodeCursor(opts.cursor) : null;
  if (anchor) {
    // Strictly "older than the anchor", with id as a deterministic tie-break.
    q = q.or(
      `created_at.lt.${anchor.createdAt},and(created_at.eq.${anchor.createdAt},id.lt.${anchor.id})`,
    );
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const all = data ?? [];
  const hasMore = all.length > perPage;
  const page = hasMore ? all.slice(0, perPage) : all;

  const rows: AuditCursorRow[] = page.map((r) => ({
    id: r.id,
    adminEmail: r.admin_email,
    action: r.action,
    targetUserId: r.target_user_id,
    targetLabel: r.target_label,
    notes: r.notes,
    createdAt: r.created_at,
  }));

  const last = rows[rows.length - 1];
  return {
    rows,
    nextCursor: hasMore && last ? encodeCursor(last) : null,
    hasMore,
    perPage,
  };
}
