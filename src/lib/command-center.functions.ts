import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";

export type ChronosKind = "notification" | "contact" | "question" | "guestbook" | "login" | "booking" | "relay";

export interface ChronosEvent {
  id: string;
  kind: ChronosKind;
  title: string;
  detail: string | null;
  at: string;
}

export interface CommandCenterData {
  connectedApps: number | null;
  activeRelays: number | null;
  unreadNotifications: number | null;
  openQuestions: number | null;
  guestbook30d: number | null;
  upcomingBookings: number | null;
  nextBookingAt: string | null;
  /** Today's confirmed appointments (Europe/Brussels day), earliest first. */
  todayBookings?: { id: string; guest: string; at: string }[];
  events: ChronosEvent[];
}

type Row = Record<string, unknown>;

const snippet = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? (s.length > 90 ? `${s.slice(0, 87)}…` : s) : null;
};
const iso = (v: unknown) => new Date(String(v)).toISOString();

/**
 * One round-trip for the cockpit: counters for every widget plus the Chronos
 * stream. Each source is isolated so one missing table never blanks the page;
 * all reads run as the member (RLS scope from requireAuth).
 */
export const getCommandCenter = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<CommandCenterData> => {
    const { sql } = await import("@/lib/neon");
    const uid = context.userId;
    const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await fn();
      } catch {
        return fallback;
      }
    };
    const count = (rows: Row[]) => Number(rows[0]?.["n"] ?? 0);

    const [apps, relays, unread, questions, guestbook, bookings, nextBooking, notes, qRows, gRows, logins, bRows, cRows, dRows, tRows] =
      await Promise.all([
        safe(async () => count((await sql`select count(*)::int as n from public.oauth_consents where user_id = ${uid} and revoked_at is null`) as Row[]), null),
        safe(async () => count((await sql`select count(*)::int as n from public.identity_relays where user_id = ${uid} and status = 'active'`) as Row[]), null),
        safe(async () => count((await sql`select count(*)::int as n from public.notifications where user_id = ${uid} and read_at is null`) as Row[]), null),
        safe(async () => count((await sql`select count(*)::int as n from public.profile_questions where owner_id = ${uid} and answer is null and not is_quarantined`) as Row[]), null),
        safe(async () => count((await sql`select count(*)::int as n from public.guestbook_entries where owner_id = ${uid} and created_at > now() - interval '30 days'`) as Row[]), null),
        safe(async () => count((await sql`select count(*)::int as n from public.bookings where host_user_id = ${uid} and start_utc > now() and status not in ('cancelled', 'canceled', 'declined', 'expired', 'held')`) as Row[]), null),
        safe(async () => {
          const r = (await sql`select start_utc from public.bookings where host_user_id = ${uid} and start_utc > now() and status not in ('cancelled', 'canceled', 'declined', 'expired', 'held') order by start_utc asc limit 1`) as Row[];
          return r[0] ? iso(r[0]["start_utc"]) : null;
        }, null),
        safe(async () => (await sql`select id, title, body, created_at from public.notifications where user_id = ${uid} order by created_at desc limit 6`) as Row[], []),
        safe(async () => (await sql`select id, body, created_at from public.profile_questions where owner_id = ${uid} and not is_quarantined order by created_at desc limit 6`) as Row[], []),
        safe(async () => (await sql`select id, body, created_at from public.guestbook_entries where owner_id = ${uid} order by created_at desc limit 6`) as Row[], []),
        safe(async () => (await sql`select l.id, coalesce(c.name, l.client_id) as app, l.disclosed_at from public.identity_disclosure_logs l
            left join public.oauth_clients c on c.client_id = l.client_id
            where l.user_id = ${uid} order by l.disclosed_at desc limit 6`) as Row[], []),
        safe(async () => (await sql`select id, guest_name, start_utc, created_at from public.bookings where host_user_id = ${uid} order by created_at desc limit 6`) as Row[], []),
        safe(async () => (await sql`select l.id, l.name, l.message, l.created_at from public.lead_captures l
            join public.profiles p on lower(p.username) = lower(l.handle)
            where p.id = ${uid} order by l.created_at desc limit 6`) as Row[], []),
        safe(async () => (await sql`select d.id, d.status, coalesce(c.name, r.client_id) as app, d.created_at from public.oauth_email_deliveries d
            join public.oauth_email_forwarding_rules r on r.id = d.rule_id
            left join public.oauth_clients c on c.client_id = r.client_id
            where d.user_id = ${uid} order by d.created_at desc limit 6`) as Row[], []),
        safe(async () => (await sql`select id, guest_name, start_utc from public.bookings where host_user_id = ${uid}
            and (start_utc at time zone 'Europe/Brussels')::date = (now() at time zone 'Europe/Brussels')::date
            and status not in ('cancelled', 'canceled', 'declined', 'expired', 'held') order by start_utc asc limit 5`) as Row[], []),
      ]);

    const events: ChronosEvent[] = [
      ...notes.map((r) => ({ id: `n:${r["id"]}`, kind: "notification" as const, title: String(r["title"] ?? "Melding"), detail: snippet(r["body"]), at: iso(r["created_at"]) })),
      ...qRows.map((r) => ({ id: `q:${r["id"]}`, kind: "question" as const, title: "Anonieme Q&A ontvangen", detail: snippet(r["body"]), at: iso(r["created_at"]) })),
      ...gRows.map((r) => ({ id: `g:${r["id"]}`, kind: "guestbook" as const, title: "Prikbord verzoek in de wachtrij", detail: snippet(r["body"]), at: iso(r["created_at"]) })),
      ...logins.map((r) => ({ id: `l:${r["id"]}`, kind: "login" as const, title: `Login gedetecteerd bij ${String(r["app"])}`, detail: null, at: iso(r["disclosed_at"]) })),
      ...cRows.map((r) => ({ id: `c:${r["id"]}`, kind: "contact" as const, title: "Inkomend contactbericht via hub", detail: snippet(r["message"]) ?? snippet(r["name"]), at: iso(r["created_at"]) })),
      ...dRows.map((r) => ({ id: `d:${r["id"]}`, kind: "relay" as const, title: r["status"] === "forwarded" ? `Relay-mail doorgestuurd van ${String(r["app"])}` : `Relay-mail tegengehouden van ${String(r["app"])}`, detail: null, at: iso(r["created_at"]) })),
      ...bRows.map((r) => ({ id: `b:${r["id"]}`, kind: "booking" as const, title: `Boeking van ${String(r["guest_name"] ?? "een gast")}`, detail: `Op ${new Date(String(r["start_utc"])).toLocaleString("nl-BE")}`, at: iso(r["created_at"]) })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 20);

    return {
      connectedApps: apps,
      activeRelays: relays,
      unreadNotifications: unread,
      openQuestions: questions,
      guestbook30d: guestbook,
      upcomingBookings: bookings,
      nextBookingAt: nextBooking,
      todayBookings: tRows.map((r) => ({ id: String(r["id"]), guest: String(r["guest_name"] ?? "Gast"), at: iso(r["start_utc"]) })),
      events,
    };
  });
