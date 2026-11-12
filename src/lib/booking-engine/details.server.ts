import { sql, withDbContext } from "@/lib/neon";
import { guestView } from "./public.server";

/**
 * One authorization boundary for the detail API: identity never comes from
 * query input. Hosts read through RLS in their own session context; guests only
 * through the token check in the database (db/0216 rout_booking_guest_view).
 */
export async function readBookingDetails(id: string, token: string | null, userId: string | null) {
  if (userId) {
    const rows = (await withDbContext({ userId, workspaceId: null }, () => sql.query(`select b.id, b.status, b.start_utc, b.end_utc, b.guest_name, b.guest_email, b.guest_note,
      b.host_user_id, b.workspace_id, t.title, t.location_value,
      coalesce(w.name,p.display_name) as host_name,
      exists(select 1 from public.workspace_members m where m.workspace_id=b.workspace_id and m.user_id=$2::uuid and m.role in ('owner','admin')) as workspace_admin
      from public.bookings b join public.booking_event_types t on t.id=b.event_type_id
      left join public.workspaces w on w.id=b.workspace_id left join public.profiles p on p.id=b.host_user_id
      where b.id=$1::uuid limit 1`, [id, userId]))) as Record<string, unknown>[];
    const b = rows[0];
    const host = Boolean(b && (b["workspace_id"] ? b["workspace_admin"] === true || b["host_user_id"] === userId : b["host_user_id"] === userId));
    if (b && host) {
      return { forbidden: false as const, id: b["id"], status: b["status"], start_at: b["start_utc"], end_at: b["end_utc"],
        host_name: b["host_name"] ?? null, guest_name: b["guest_name"], guest_email: b["guest_email"],
        meeting_notes: b["guest_note"] ?? null, location: b["location_value"] ?? null, title: b["title"] };
    }
  }
  const v = await guestView(id, token);
  if (!v) return null;
  if (v.masked) return { forbidden: true as const };
  return { forbidden: false as const, id: v.id, status: v.status, start_at: v.startUtc, end_at: v.endUtc,
    host_name: v.hostName ?? null, guest_name: v.guestName, guest_email: v.guestEmail,
    meeting_notes: null, location: v.locationValue ?? null, title: v.title };
}
