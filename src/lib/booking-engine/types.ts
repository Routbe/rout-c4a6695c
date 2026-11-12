import { z } from "zod";
import { intakeFields } from "./intake";

/**
 * ROUT Unified Booking Engine — shared schemas. Every instant crossing this
 * boundary is an ISO-8601 string in UTC ("…Z"); IANA zones only name how a
 * rule or a guest sees time.
 */

export const SLOT_MINUTES = 15;
export const SLOTS_PER_DAY = 96; // 24h / 15min, matches bit(96)

const isIanaZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};
export const ianaZone = z.string().min(1).max(64).refine(isIanaZone, "invalid_timezone");
export const utcInstant = z.string().datetime({ offset: false }); // must end in Z

export const routingStrategy = z.enum(["STRICT", "ROUND_ROBIN", "COLLECTIVE"]);
export const confirmationMode = z.enum(["instant", "request"]);
export const locationKind = z.enum(["video", "address", "phone"]);
export const calendarAdapterKind = z.enum(["google", "microsoft", "caldav", "ics"]);
export const bookingStatus = z.enum(["held", "pending_payment", "requested", "confirmed", "declined", "cancelled"]);
export const ACTIVE_BOOKING_STATUSES = ["held", "pending_payment", "requested", "confirmed"] as const;

export const eventTypeInput = z
  .object({
    ownerUserId: z.string().uuid().nullable(),
    workspaceId: z.string().uuid().nullable(),
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
    title: z.string().trim().min(1).max(120),
    description: z.string().max(2000).nullable().default(null),
    durationMinutes: z.number().int().min(5).max(480).multipleOf(5),
    bufferBeforeMinutes: z.number().int().min(0).max(240).default(0),
    bufferAfterMinutes: z.number().int().min(0).max(240).default(0),
    minimumNoticeHours: z.number().int().min(0).max(720).default(2),
    maxDaysAhead: z.number().int().min(1).max(365).default(30),
    slotStepMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]).default(15),
    confirmationMode: confirmationMode.default("instant"),
    priceCents: z.number().int().min(50).nullable().default(null),
    currency: z.string().regex(/^[a-z]{3}$/).default("eur"),
    routingStrategy: routingStrategy.default("STRICT"),
    locationKind: locationKind.default("video"),
    locationValue: z.string().max(500).nullable().default(null),
    hostUserIds: z.array(z.string().uuid()).min(1).max(50),
    resourceCapacity: z.number().int().min(1).max(100).default(1),
    customFields: intakeFields.default([]),
    // Phase 2 (db/0218). Limits count meetings per host in the type's calendar period.
    limitPerDay: z.number().int().min(1).max(200).nullable().default(null),
    limitPerWeek: z.number().int().min(1).max(1000).nullable().default(null),
    limitPerMonth: z.number().int().min(1).max(5000).nullable().default(null),
    limitPerGuest: z.number().int().min(1).max(50).nullable().default(null),
    horizonBusinessDays: z.number().int().min(1).max(260).nullable().default(null),
    adjacentOnly: z.boolean().default(false),
    rulesTimezone: ianaZone.nullable().default(null),
  })
  .refine((v) => (v.ownerUserId === null) !== (v.workspaceId === null), { message: "exactly_one_owner" })
  .refine((v) => v.workspaceId !== null || v.routingStrategy === "STRICT", { message: "personal_types_are_strict" })
  .refine((v) => v.routingStrategy !== "STRICT" || v.hostUserIds.length === 1, { message: "strict_has_one_host" });
export type EventTypeInput = z.infer<typeof eventTypeInput>;

/** What the engine needs from a stored event type. */
export interface EventTypeRules {
  id: string;
  workspaceId: string | null;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minimumNoticeHours: number;
  maxDaysAhead: number;
  slotStepMinutes: number;
  confirmationMode: z.infer<typeof confirmationMode>;
  priceCents: number | null;
  currency: string;
  routingStrategy: z.infer<typeof routingStrategy>;
  title: string;
  locationKind: z.infer<typeof locationKind>;
  locationValue: string | null;
  /** Gap-free mode (db/0218): only starts that touch a taken slot or the edge of working hours. */
  adjacentOnly?: boolean;
  /** Exclusive end of the bookable window from the database (business days or max days ahead). */
  horizonEndUtc?: Date | null;
}

export const availabilityRule = z
  .object({
    weekday: z.number().int().min(0).max(6), // 0 = Sunday, in the rule's own zone
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
    timezone: ianaZone,
  })
  .refine((r) => r.endMinute > r.startMinute, { message: "end_before_start" });
export type AvailabilityRule = z.infer<typeof availabilityRule>;

export interface UtcInterval {
  startUtc: Date;
  endUtc: Date;
}

export const bookingRequest = z.object({
  eventTypeId: z.string().uuid(),
  startUtc: utcInstant,
  guestName: z.string().trim().min(1).max(120),
  guestEmail: z.string().trim().toLowerCase().email().max(254),
  guestTimezone: ianaZone,
  guestNote: z.string().max(2000).nullable().default(null),
  intakeAnswers: z.record(z.string().max(32), z.union([z.string().max(2000), z.boolean()])).nullable().default(null),
  /** Soft-lock from holdBookingSlot; without it (or expired) the regular rules apply. */
  holdId: z.string().uuid().nullable().default(null),
  holdSecret: z.string().regex(/^[a-f0-9]{64}$/).nullable().default(null),
});
export type BookingRequest = z.infer<typeof bookingRequest>;

export type BookingOutcome =
  | { ok: true; bookingIds: string[]; bookingToken: string | null; status: z.infer<typeof bookingStatus>; hostUserIds: string[]; checkoutUrl: string | null }
  | { ok: false; reason: "slot_taken" | "outside_availability" | "too_soon" | "too_far" | "inactive" | "payment_unavailable" | "invalid_intake" | "guest_limit" };

/** Zero-knowledge busy block: the ONLY shape a calendar adapter may emit. */
export interface BusyBlock {
  providerId: string; // HMAC-SHA256 hex of the external id, never the id itself
  startUtc: Date;
  endUtc: Date;
  isBlocking: boolean;
}

/** https on port 443, no userinfo; the DNS check runs server-side before storing and before every fetch. */
const calendarUrl = z.string().trim().max(2000).url().startsWith("https://").refine((v) => {
  try {
    const u = new URL(v);
    return !u.username && !u.password && (!u.port || u.port === "443");
  } catch {
    return false;
  }
}, "invalid_url");
export const icsFeedCredentials = z.object({ url: calendarUrl });
export const caldavCredentials = z.object({
  url: calendarUrl,
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(500),
});
