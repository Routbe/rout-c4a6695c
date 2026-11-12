/** Guest confirmation mail with a .ics attachment. Never throws, never blocks the booking. */
import { sql } from "@/lib/neon";
import { buildIcs } from "./ics";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function sendBookingInvite(bookingId: string, method: "REQUEST" | "CANCEL" = "REQUEST"): Promise<boolean> {
  try {
    const rows = (await sql`select b.ics_uid, b.sequence, b.start_utc, b.end_utc, b.guest_name, b.guest_email, b.guest_timezone,
        t.title, t.location_kind, t.location_value, u.email as host_email
      from public.bookings b join public.booking_event_types t on t.id = b.event_type_id
      join public.users u on u.id = b.host_user_id where b.id = ${bookingId}::uuid`) as Record<string, string | number>[];
    const r = rows[0];
    if (!r) return false;
    const start = new Date(String(r["start_utc"]));
    const end = new Date(String(r["end_utc"]));
    const location = r["location_value"] ? String(r["location_value"]) : undefined;
    const ics = buildIcs({
      uid: String(r["ics_uid"]), sequence: Number(r["sequence"]), method, startUtc: start, endUtc: end,
      summary: String(r["title"]), location,
      url: r["location_kind"] === "video" ? location : undefined,
      organizerEmail: "noreply@rout.be", organizerName: "ROUT",
      attendeeEmail: String(r["guest_email"]), attendeeName: String(r["guest_name"]),
    });
    // Times are rendered in the guest's own zone; storage stays UTC.
    const when = new Intl.DateTimeFormat("nl-BE", { dateStyle: "full", timeStyle: "short", timeZone: String(r["guest_timezone"]) }).format(start);
    const title = String(r["title"]);
    const { sendMail } = await import("@/emails/send.server");
    const res = await sendMail({
      to: String(r["guest_email"]),
      subject: `${method === "CANCEL" ? "Geannuleerd" : "Bevestigd"}: ${title} // ROUT`,
      html: `<p>${method === "CANCEL" ? "Je afspraak is geannuleerd" : "Je afspraak is bevestigd"}: <strong>${esc(title)}</strong></p><p>${esc(when)} (${esc(String(r["guest_timezone"]))})</p>${location ? `<p>${esc(location)}</p>` : ""}<p>De afspraak zit als bijlage bij deze e-mail en verschijnt automatisch in je agenda.</p>`,
      text: `${title}\n${when}\n${location ?? ""}`,
      attachments: [{ name: "invite.ics", contentBase64: btoa(unescape(encodeURIComponent(ics))) }],
      tags: ["booking", `booking-${method.toLowerCase()}`],
    });
    return res.sent;
  } catch (e) {
    console.error("[booking] invite", e instanceof Error ? e.message : "error");
    return false;
  }
}
