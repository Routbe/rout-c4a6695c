import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";
import { availabilityRule, bookingRequest, caldavCredentials, eventTypeInput, icsFeedCredentials } from "./types";

const uuid = z.string().uuid();
const fail = (e: unknown) => {
  const m = e instanceof Error ? e.message : "error";
  return ["slug_taken", "host_not_member", "Forbidden", "forbidden", "not_found", "too_many_calendars", "encryption_unavailable", "too_many_overrides"].includes(m) ? m : "error";
};

// ---------- public (visitor) ----------

export const getPublicEventType = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data }) => {
    const s = await import("./public.server");
    const et = await s.publicEventType(data.id);
    if (!et) return null;
    const { rules: _rules, hostCount: _hosts, ...pub } = et;
    return pub;
  });

export const getPublicSlots = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ id: uuid, holdId: uuid.nullable().optional() }).parse(input))
  .handler(async ({ data }) => {
    const s = await import("./public.server");
    try {
      return { slots: await s.publicSlots(data.id, new Date(), data.holdId ?? null) };
    } catch (e) {
      console.error("[booking] slots", e instanceof Error ? e.message : "error");
      return { slots: [] as string[] };
    }
  });

/** Edge-set client IP first: a visitor can write their own x-forwarded-for. */
async function visitorIp(): Promise<string> {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  return (getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-real-ip") ?? getRequestHeader("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
}

const holdSecret = z.string().regex(/^[a-f0-9]{64}$/);

/** Clicking a slot reserves it for 5 minutes while the visitor fills in the form (db/0218). */
export const holdBookingSlot = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      eventTypeId: uuid, startUtc: z.string().datetime({ offset: false }),
      replace: z.object({ id: uuid, secret: holdSecret }).nullable().default(null),
    }).parse(input))
  .handler(async ({ data }) => {
    await (await import("@/lib/platform-features.server")).assertPlatformFeature("bookings");
    const { hitRateLimit, sha256Hex } = await import("@/lib/rate-limit-db.server");
    const ip = await visitorIp();
    const rl = await hitRateLimit("booking_hold", ip, { limit: 40, windowSec: 3600 });
    if (!rl.ok) return { ok: false as const, reason: "rate_limited" as const };
    const { holdSlot } = await import("./book.server");
    try {
      // Holds live ≤ 6 minutes; the digest only lets the database cap holds per visitor.
      return await holdSlot(data.eventTypeId, data.startUtc, await sha256Hex(`rout-booking-hold:v1:${ip}`), data.replace);
    } catch (e) {
      console.error("[booking] hold", e instanceof Error ? e.message : "error");
      return { ok: false as const, reason: "unavailable" as const };
    }
  });

export const releaseBookingSlot = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ holdId: uuid, secret: holdSecret }).parse(input))
  .handler(async ({ data }) => {
    const { releaseSlotHold } = await import("./book.server");
    try {
      return { ok: await releaseSlotHold(data.holdId, data.secret) };
    } catch (e) {
      console.error("[booking] release", e instanceof Error ? e.message : "error");
      return { ok: false };
    }
  });

export const createBooking = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => bookingRequest.parse(input))
  .handler(async ({ data }) => {
    await (await import("@/lib/platform-features.server")).assertPlatformFeature("bookings");
    const { hitRateLimit } = await import("@/lib/rate-limit-db.server");
    const ip = await visitorIp();
    const rl = await hitRateLimit("booking_create", ip, { limit: 10, windowSec: 3600 });
    if (!rl.ok) return { ok: false as const, reason: "rate_limited" as const };
    const { bookSlot } = await import("./book.server");
    try {
      const r = await bookSlot(data);
      if (!r.ok) return r;
      const bookingId = r.bookingIds[0];
      if (!bookingId) return { ok: false as const, reason: "error" as const };
      return { ok: true as const, bookingId, bookingToken: r.bookingToken, status: r.status, checkoutUrl: r.checkoutUrl };
    } catch (e) {
      console.error("[booking] create", e instanceof Error ? e.message : "error");
      return { ok: false as const, reason: "error" as const };
    }
  });

export const getBookingSummary = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ id: uuid, token: z.string().max(128).optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const s = await import("./public.server");
    return s.bookingSummary(data.id, data.token ?? null);
  });

// ---------- owner (studio) ----------

export const getBookingStudio = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const s = await import("./manage.server");
    try {
      return { ready: true as const, ...(await s.overview(context.userId)), userId: context.userId };
    } catch (e) {
      console.error("[booking] studio", e instanceof Error ? e.message : "error");
      return { ready: false as const };
    }
  });

export const saveBookingEventType = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ id: uuid.nullable(), input: eventTypeInput }).parse(input))
  .handler(async ({ data, context }) => {
    const s = await import("./manage.server");
    try {
      return { ok: true as const, ...(await s.saveEventType(context.userId, data.id, data.input)) };
    } catch (e) {
      return { ok: false as const, reason: fail(e) };
    }
  });

export const setBookingEventTypeActive = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ id: uuid, active: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const s = await import("./manage.server");
    await s.setEventTypeActive(context.userId, data.id, data.active);
    return { ok: true };
  });

export const saveAvailabilityRules = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ rules: z.array(availabilityRule).max(50) }).parse(input))
  .handler(async ({ data, context }) => {
    const s = await import("./manage.server");
    await s.saveRules(context.userId, data.rules);
    return { ok: true };
  });

export const addBookingCalendar = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.discriminatedUnion("adapter", [
      z.object({ adapter: z.literal("ics"), label: z.string().max(80).nullable(), credentials: icsFeedCredentials }),
      z.object({ adapter: z.literal("caldav"), label: z.string().max(80).nullable(), credentials: caldavCredentials }),
    ]).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Same outbound gate as the sync itself (shape + DNS), so no internal address is ever stored.
    const { assertCalendarUrl } = await import("./adapters/fetchers.server");
    try {
      await assertCalendarUrl(data.credentials.url);
    } catch {
      return { ok: false as const, reason: "invalid_url" };
    }
    const s = await import("./manage.server");
    try {
      const { id } = await s.addCalendar(context.userId, data.adapter, data.label, data.credentials);
      await s.syncNow(context.userId, id).catch(() => undefined);
      return { ok: true as const, id };
    } catch (e) {
      return { ok: false as const, reason: fail(e) };
    }
  });

export const removeBookingCalendar = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const s = await import("./manage.server");
    await s.removeCalendar(context.userId, data.id);
    return { ok: true };
  });

export const syncBookingCalendar = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const s = await import("./manage.server");
    await s.syncNow(context.userId, data.id);
    return { ok: true };
  });

export const actOnBooking = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ id: uuid, action: z.enum(["confirm", "decline", "cancel"]) }).parse(input))
  .handler(async ({ data, context }) => {
    const s = await import("./manage.server");
    return s.bookingAction(context.userId, data.id, data.action);
  });

export const getNextBookingSlots = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ handle: z.string().min(1).max(64), eventTypeId: uuid.nullable() }).parse(input))
  .handler(async ({ data }) => {
    const { setResponseHeader } = await import("@tanstack/react-start/server");
    setResponseHeader("Cache-Control", "public, max-age=60");
    const s = await import("./public.server");
    try {
      return await s.nextPublicSlots(data.handle, data.eventTypeId, 3);
    } catch (e) {
      console.error("[booking] next slots", e instanceof Error ? e.message : "error");
      return null;
    }
  });

export const addAvailabilityException = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ kind: z.enum(["free", "busy"]), startUtc: z.string().datetime(), endUtc: z.string().datetime() })
      .refine((v) => new Date(v.endUtc) > new Date(v.startUtc), { message: "end_before_start" })
      .refine((v) => new Date(v.endUtc).getTime() - new Date(v.startUtc).getTime() <= 366 * 86400000, { message: "too_long" })
      .parse(input))
  .handler(async ({ data, context }) => {
    const s = await import("./manage.server");
    try {
      await s.addOverride(context.userId, data.kind, data.startUtc, data.endUtc);
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, reason: fail(e) };
    }
  });

export const removeAvailabilityException = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const s = await import("./manage.server");
    await s.removeOverride(context.userId, data.id);
    return { ok: true };
  });
