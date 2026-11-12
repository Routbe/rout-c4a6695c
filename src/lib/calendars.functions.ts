import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

export type CalendarMode = "linked" | "sovereign";
export interface RoutCalendar {
  id: string;
  mode: CalendarMode;
  publicId: string;
  title: string;
  eventTypeId: string | null;
  isActive: boolean;
  createdAt: string;
}

type Row = Record<string, unknown>;
const toCal = (r: Row): RoutCalendar => ({
  id: String(r["id"]),
  mode: r["mode"] === "sovereign" ? "sovereign" : "linked",
  publicId: String(r["public_id"]),
  title: String(r["title"]),
  eventTypeId: r["event_type_id"] ? String(r["event_type_id"]) : null,
  isActive: Boolean(r["is_active"]),
  createdAt: new Date(String(r["created_at"])).toISOString(),
});

/** The member's own calendars (RLS: owner only). */
export const listMyCalendars = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<RoutCalendar[]> => {
    const { sql } = await import("@/lib/neon");
    // Owner predicate on top of RLS: never rely on one layer for ownership.
    const rows = (await sql`select id, mode, public_id, title, event_type_id, is_active, created_at
      from public.rout_calendars where user_id = ${context.userId}::uuid order by created_at desc limit 100`) as Row[];
    return rows.map(toCal);
  });

/** The member's event types, to attach to a calendar. */
export const listMyEventTypes = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<{ id: string; title: string }[]> => {
    const { sql } = await import("@/lib/neon");
    const rows = (await sql`select id, title from public.booking_event_types
      where user_id = ${context.userId} order by title limit 100`) as Row[];
    return rows.map((r) => ({ id: String(r["id"]), title: String(r["title"] ?? "Afspraak") }));
  });

export const createCalendar = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({
      title: z.string().trim().min(1).max(120),
      mode: z.enum(["linked", "sovereign"]),
      eventTypeId: z.string().uuid().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }): Promise<RoutCalendar> => {
    const { sql } = await import("@/lib/neon");
    const { nanoid } = await import("nanoid");
    // A calendar may only point at one of the member's own event types.
    if (data.eventTypeId) {
      const own = (await sql`select 1 from public.booking_event_types where id = ${data.eventTypeId}::uuid and user_id = ${context.userId}::uuid`) as Row[];
      if (!own.length) throw new Error("Dit afspraaktype is niet van jou.");
    }
    const rows = (await sql`insert into public.rout_calendars (user_id, mode, public_id, title, event_type_id)
      values (${context.userId}, ${data.mode}, ${nanoid(16)}, ${data.title}, ${data.eventTypeId})
      returning id, mode, public_id, title, event_type_id, is_active, created_at`) as Row[];
    return toCal(rows[0]!);
  });

export const setCalendarActive = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { sql } = await import("@/lib/neon");
    await sql`update public.rout_calendars set is_active = ${data.active}, updated_at = now() where id = ${data.id} and user_id = ${context.userId}::uuid`;
    return { ok: true };
  });

export const deleteCalendar = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { sql } = await import("@/lib/neon");
    await sql`delete from public.rout_calendars where id = ${data.id} and user_id = ${context.userId}::uuid`;
    return { ok: true };
  });

/** Public read for /a/<id>: title + event type only, never the owner. */
export const getPublicCalendar = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ publicId: z.string().regex(/^[A-Za-z0-9_-]{12,32}$/) }).parse(input))
  .handler(async ({ data }): Promise<{ title: string; eventTypeId: string | null } | null> => {
    const { sql } = await import("@/lib/neon");
    try {
      const rows = (await sql`select title, event_type_id from public.rout_public_calendar(${data.publicId})`) as Row[];
      const r = rows[0];
      return r ? { title: String(r["title"]), eventTypeId: r["event_type_id"] ? String(r["event_type_id"]) : null } : null;
    } catch (e) {
      console.error("[calendar] public", e instanceof Error ? e.message : "error");
      return null;
    }
  });
