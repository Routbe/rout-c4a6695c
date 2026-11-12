/**
 * Transactional booking through db/0216 `rout_booking_create`. One call = one
 * transaction in the database: advisory locks per (host, UTC day) for every
 * day the block touches, event rules (active, grid, notice, horizon), cached
 * availability over the whole block, live overlap/capacity/calendar checks,
 * then the insert. The GiST EXCLUDE constraint stays the last line of defence.
 * Status and payment hold come from the event type, never from this code.
 */
import { sql, withDbContext } from "@/lib/neon";
import type { BookingOutcome, BookingRequest } from "./types";
import { splitSensitive, validateIntake } from "./intake";
import { publicEventType } from "./public.server";

const OUTCOMES = new Set(["slot_taken", "outside_availability", "too_soon", "too_far", "inactive", "invalid_input", "guest_limit"]);

export function isSlotTakenError(err: unknown): boolean {
  const e = err as { code?: string; message?: string; body?: string };
  const text = `${e?.message ?? ""} ${e?.body ?? ""}`;
  return e?.code === "23P01" || /23P01|slot_taken|bookings_no_overlap/.test(text);
}

type CreateResult =
  | { ok: false; reason: string }
  | { ok: true; bookingIds: string[]; hostIds: string[]; token: string | null; status: string; holdExpiresAt: string | null; groupId: string | null };

/** Try to book; never throws for a lost race. */
export async function bookSlot(req: BookingRequest): Promise<BookingOutcome> {
  const et = await publicEventType(req.eventTypeId);
  if (!et || et.hostCount === 0) return { ok: false, reason: "inactive" };
  const paid = et.priceCents != null;
  if (paid && !process.env["STRIPE_SECRET_KEY"]) return { ok: false, reason: "payment_unavailable" };

  const checked = validateIntake(et.customFields, req.intakeAnswers ?? {});
  if (!checked.ok) return { ok: false, reason: "invalid_intake" };
  let intake: Record<string, unknown> | null = null;
  if (Object.keys(checked.answers).length) {
    const { plain, secret } = splitSensitive(et.customFields, checked.answers);
    intake = { v: 1, plain };
    if (Object.keys(secret).length) {
      // Sensitive answers are sealed (AES-GCM) bound to the event type; never logged or sent to third parties.
      const { seal, encryptionConfigured } = await import("@/lib/crypto/secretbox.server");
      if (!encryptionConfigured()) return { ok: false, reason: "invalid_intake" };
      intake["sealed"] = await seal(JSON.stringify(secret), `intake:${et.id}`);
    }
  }

  let r: CreateResult;
  try {
    const intakeJson = intake ? JSON.stringify(intake) : null;
    // The 9-argument form (db/0218) consumes the visitor's soft-lock; a hold only exists once 0218 is live.
    const rows = (req.holdId && req.holdSecret && et.holdMinutes != null
      ? await sql`select public.rout_booking_create(${et.id}::uuid, ${req.startUtc}::timestamptz,
          ${req.guestName}, ${req.guestEmail}, ${req.guestTimezone}, ${req.guestNote}, ${intakeJson}::jsonb,
          ${req.holdId}::uuid, ${req.holdSecret}) as r`
      : await sql`select public.rout_booking_create(${et.id}::uuid, ${req.startUtc}::timestamptz,
          ${req.guestName}, ${req.guestEmail}, ${req.guestTimezone}, ${req.guestNote}, ${intakeJson}::jsonb) as r`) as { r: CreateResult }[];
    r = rows[0]!.r;
  } catch (err) {
    if (isSlotTakenError(err)) return { ok: false, reason: "slot_taken" };
    throw err;
  }
  if (!r.ok) {
    const reason = r.reason === "invalid_input" ? "invalid_intake" : r.reason;
    return { ok: false, reason: (OUTCOMES.has(r.reason) ? reason : "slot_taken") as Exclude<BookingOutcome, { ok: true }>["reason"] };
  }

  const firstId = r.bookingIds[0]!;
  let checkoutUrl: string | null = null;
  if (paid) {
    checkoutUrl = await createCheckoutHold(firstId, et, req, new Date(r.holdExpiresAt!), r.token).catch(async (e: unknown) => {
      console.error("[booking] checkout", e instanceof Error ? e.message : "error");
      await releaseBookingHold(firstId);
      return null;
    });
    if (!checkoutUrl) return { ok: false, reason: "payment_unavailable" };
  }
  if (r.status === "confirmed") void inviteAsHost(firstId, r.hostIds[0]!, "REQUEST");
  return { ok: true, bookingIds: r.bookingIds, bookingToken: r.token, status: r.status as "confirmed", hostUserIds: r.hostIds, checkoutUrl };
}

/** Guest mail runs as the host so it reads the booking through RLS, not around it. */
function inviteAsHost(bookingId: string, hostUserId: string, method: "REQUEST" | "CANCEL") {
  return withDbContext({ userId: hostUserId, workspaceId: null }, async () => {
    const { sendBookingInvite } = await import("./invite.server");
    return sendBookingInvite(bookingId, method);
  });
}

async function createCheckoutHold(
  bookingId: string, et: { title: string; currency: string; priceCents: number | null }, req: BookingRequest, expires: Date, bookingToken: string | null,
): Promise<string> {
  const site = (process.env["PUBLIC_SITE_URL"] ?? "https://rout.be").replace(/\/$/, "");
  const body = new URLSearchParams({
    mode: "payment",
    customer_email: req.guestEmail,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": et.currency,
    "line_items[0][price_data][unit_amount]": String(et.priceCents),
    "line_items[0][price_data][product_data][name]": et.title,
    "metadata[kind]": "booking",
    "metadata[booking_id]": bookingId,
    "payment_intent_data[metadata][booking_id]": bookingId,
    expires_at: String(Math.floor(expires.getTime() / 1000) + 5),
    success_url: `${site}/booking/${bookingId}?paid=1${bookingToken ? `&token=${bookingToken}` : ""}`,
    cancel_url: `${site}/booking/${bookingId}?cancelled=1`,
  });
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env["STRIPE_SECRET_KEY"]}`, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": `booking-${bookingId}` },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`stripe ${res.status}: ${text.slice(0, 300)}`);
  const session = JSON.parse(text) as { id: string; url: string };
  const saved = (await sql`select public.rout_booking_set_checkout(${bookingId}::uuid, ${session.id}) as ok`) as { ok: boolean | null }[];
  if (!saved[0]?.ok) throw new Error("checkout_not_recorded");
  return session.url;
}

/** Webhook: payment done → whole group confirmed (or requested). Idempotent; needs the issued session. */
export async function confirmPaidBooking(bookingId: string, sessionId: string): Promise<string> {
  const rows = (await sql`select public.rout_booking_confirm_paid(${bookingId}::uuid, ${sessionId}) as r`) as { r: { status: string; hostIds: string[] } }[];
  const r = rows[0]?.r;
  if (r?.status === "confirmed" && r.hostIds[0]) void inviteAsHost(bookingId, r.hostIds[0], "REQUEST");
  return r?.status ?? "noop";
}

export async function releaseBookingHold(bookingId: string): Promise<string> {
  const rows = (await sql`select public.rout_booking_release_hold(${bookingId}::uuid) as n`) as { n: number }[];
  return Number(rows[0]?.n ?? 0) > 0 ? "released" : "noop";
}

/** Cron safety net for holds whose Stripe expiry webhook never arrived. */
export async function releaseExpiredHolds(): Promise<number> {
  const rows = (await sql`select public.rout_booking_release_expired(500) as n`) as { n: number }[];
  return Number(rows[0]?.n ?? 0);
}

export type HoldOutcome =
  | { ok: true; holdId: string; secret: string; expiresAt: string; startUtc: string }
  | { ok: false; reason: "slot_taken" | "outside_availability" | "too_soon" | "too_far" | "inactive" | "too_many_holds" | "unavailable" };

const HOLD_REASONS = new Set(["slot_taken", "outside_availability", "too_soon", "too_far", "inactive", "too_many_holds"]);

/**
 * Soft-lock a start for 5 minutes (db/0218). `clientKey` is a digest of the
 * visitor's network identity so one visitor cannot hold more than 3 slots.
 * Before 0218 is live this reports `unavailable` and the page books without a hold.
 */
export async function holdSlot(eventTypeId: string, startUtc: string, clientKey: string, replace: { id: string; secret: string } | null): Promise<HoldOutcome> {
  const et = await publicEventType(eventTypeId);
  if (!et || et.hostCount === 0) return { ok: false, reason: "inactive" };
  if (et.holdMinutes == null) return { ok: false, reason: "unavailable" };
  const rows = (await sql`select public.rout_booking_hold(${eventTypeId}::uuid, ${startUtc}::timestamptz, ${clientKey},
      ${replace?.id ?? null}::uuid, ${replace?.secret ?? null}) as r`) as { r: { ok: boolean; reason?: string; holdId?: string; secret?: string; expiresAt?: string; startUtc?: string } }[];
  const r = rows[0]?.r;
  if (r?.ok && r.holdId && r.secret && r.expiresAt) {
    return { ok: true, holdId: r.holdId, secret: r.secret, expiresAt: new Date(r.expiresAt).toISOString(), startUtc: new Date(r.startUtc ?? startUtc).toISOString() };
  }
  const reason = r?.reason && HOLD_REASONS.has(r.reason) ? r.reason : "slot_taken";
  return { ok: false, reason: reason as Exclude<HoldOutcome, { ok: true }>["reason"] };
}

export async function releaseSlotHold(holdId: string, secret: string): Promise<boolean> {
  const rows = (await sql`select public.rout_booking_hold_release(${holdId}::uuid, ${secret}) as ok`) as { ok: boolean | null }[];
  return Boolean(rows[0]?.ok);
}
