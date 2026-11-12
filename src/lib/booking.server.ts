/**
 * Boekingsmotor: aanvraag opslaan in Neon, host per Brevo verwittigen met
 * accept/decline-links, en bij aanvaarding een .ics-uitnodiging naar de gast
 * sturen. Server-only.
 */
import { bookingSigningSecret, checkBookingToken, signBookingToken } from "@/lib/booking-token";
import { sql } from "@/lib/neon";
import {
  sendBookingRequestToHost,
  sendBookingConfirmedToGuest,
  sendBookingDeclinedToGuest,
} from "@/lib/brevo/client";
import {
  BOOKING_MESSAGE_MAX,
  buildIcs,
  googleCalendarUrl,
  parseBookingConfig,
  type BookingConfig,
} from "@/lib/booking";

type Row = Record<string, unknown>;

function siteOrigin(): string {
  return (process.env["PUBLIC_SITE_URL"] ?? "https://rout.be").replace(/\/$/, "");
}

/** Signs one action for one request with an expiring HMAC-SHA256 token. */
export function bookingToken(id: string, action: "accept" | "decline"): string {
  return signBookingToken(bookingSigningSecret(), id, action);
}

export function verifyBookingToken(id: string, action: "accept" | "decline", token: string): boolean {
  let secret: string;
  try { secret = bookingSigningSecret(); } catch { return false; }
  return checkBookingToken(secret, id, action, token);
}

interface HostRow {
  id: string;
  username: string | null;
  display_name: string | null;
  email: string | null;
  config: BookingConfig;
}

/** Zoekt het profiel én de boekingsconfiguratie die de maker zelf instelde. */
async function hostFor(handle: string): Promise<HostRow | null> {
  const rows = (await sql`
    select p.id, p.username, p.display_name, p.blocks,
           coalesce(p.forwarding_email, p.email) as email
      from public.profiles p
     where lower(p.username) = ${handle.toLowerCase()}
     limit 1
  `) as Row[];
  const row = rows[0];
  if (!row) return null;
  const blocks = Array.isArray(row["blocks"]) ? (row["blocks"] as Row[]) : [];
  const block = blocks.find((b) => b?.["kind"] === "booking_request" && b?.["hidden"] !== true);
  if (!block) return null;
  return {
    id: String(row["id"]),
    username: (row["username"] as string | null) ?? null,
    display_name: (row["display_name"] as string | null) ?? null,
    email: (row["email"] as string | null) ?? null,
    config: parseBookingConfig(String(block["value"] ?? "")),
  };
}

export interface BookingInput {
  handle: string;
  guestName: string;
  guestEmail: string;
  preferredDate: string;
  preferredTime: string;
  guestMessage?: string | null;
}

/** Slaat de aanvraag op en verwittigt de host. Werpt nooit door naar de gast. */
export async function createBookingRequest(
  input: BookingInput,
): Promise<{ ok: boolean; message: string }> {
  const host = await hostFor(input.handle);
  if (!host) {
    return { ok: false, message: "Dit profiel neemt momenteel geen afspraken aan." };
  }

  const message = (input.guestMessage ?? "").slice(0, BOOKING_MESSAGE_MAX) || null;
  let id: string;
  try {
    const rows = (await sql`
      insert into public.booking_requests
        (profile_id, guest_name, guest_email, preferred_date, preferred_time,
         guest_message, duration_minutes, title)
      values (${host.id}, ${input.guestName}, ${input.guestEmail}, ${input.preferredDate},
              ${input.preferredTime}, ${message}, ${host.config.duration}, ${host.config.title})
      returning id
    `) as Row[];
    id = String(rows[0]?.["id"] ?? "");
  } catch (error) {
    console.error("[booking] kon de aanvraag niet bewaren", error);
    return { ok: false, message: "Aanvragen lukte niet. Probeer het later opnieuw." };
  }

  const base = siteOrigin();
  const acceptUrl = `${base}/api/public/bookings/${id}/accept?token=${bookingToken(id, "accept")}`;
  const declineUrl = `${base}/api/public/bookings/${id}/decline?token=${bookingToken(id, "decline")}`;

  if (host.email) {
    await sendBookingRequestToHost({
      to: host.email,
      guestName: input.guestName,
      guestEmail: input.guestEmail,
      date: input.preferredDate,
      time: input.preferredTime,
      durationMinutes: host.config.duration,
      message,
      acceptUrl,
      declineUrl,
    });
  }

  return { ok: true, message: "Je aanvraag is verstuurd. Je hoort snel iets per e-mail." };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Verwerkt de klik op accepteren/weigeren uit de hostmail. */
export async function resolveBookingRequest(
  id: string,
  action: "accept" | "decline",
): Promise<{ ok: boolean; message: string }> {
  const rows = (await sql`
    update public.booking_requests
       set status = ${action === "accept" ? "accepted" : "declined"}, updated_at = now()
     where id = ${id}::uuid and status = 'pending'
     returning id, profile_id, guest_name, guest_email, preferred_date, preferred_time,
               guest_message, duration_minutes, title
  `) as Row[];
  const booking = rows[0];
  if (!booking) {
    return { ok: false, message: "Deze aanvraag is al afgehandeld of bestaat niet." };
  }

  const hostRows = (await sql`
    select display_name, username, coalesce(forwarding_email, email) as email
      from public.profiles where id = ${String(booking["profile_id"])}::uuid limit 1
  `) as Row[];
  const hostEmail = (hostRows[0]?.["email"] as string | null) ?? "hallo@rout.be";
  const hostName =
    (hostRows[0]?.["display_name"] as string | null) ??
    (hostRows[0]?.["username"] as string | null) ??
    "ROUT";

  const guestEmail = String(booking["guest_email"]);
  const guestName = String(booking["guest_name"]);
  const date = String(booking["preferred_date"]).slice(0, 10);
  const time = String(booking["preferred_time"]).slice(0, 5);
  const title = String(booking["title"] ?? "Afspraak") || "Afspraak";
  const duration = Number(booking["duration_minutes"] ?? 30);

  if (action === "decline") {
    await sendBookingDeclinedToGuest({
      to: guestEmail,
      guestName,
      hostName,
      date,
      time,
    });
    return { ok: true, message: "Aanvraag geweigerd. De gast is verwittigd." };
  }

  const ics = buildIcs({
    uid: String(booking["id"]),
    title,
    date,
    time,
    durationMinutes: duration,
    guestName,
    guestEmail,
    hostEmail,
    description: String(booking["guest_message"] ?? ""),
  });
  const gcal = googleCalendarUrl({
    uid: String(booking["id"]),
    title,
    date,
    time,
    durationMinutes: duration,
    guestName,
    guestEmail,
    hostEmail,
    description: String(booking["guest_message"] ?? ""),
  });

  await sendBookingConfirmedToGuest({
    to: guestEmail,
    guestName,
    hostName,
    hostEmail,
    title,
    date,
    time,
    durationMinutes: duration,
    calendarUrl: gcal,
    ics,
  });

  return { ok: true, message: "Afspraak aanvaard. De gast kreeg een agenda-uitnodiging." };
}
