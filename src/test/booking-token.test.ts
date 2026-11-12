import { describe, expect, it } from "vitest";
import { bookingSigningSecret, checkBookingToken, signBookingToken, BOOKING_TOKEN_TTL_SECONDS } from "@/lib/booking-token";

const S = "x".repeat(40);
describe("booking approval tokens", () => {
  it("accepts a fresh token for the same booking and action", () => {
    expect(checkBookingToken(S, "b1", "accept", signBookingToken(S, "b1", "accept", 1000), 1000)).toBe(true);
  });
  it("rejects another action, booking or secret", () => {
    const t = signBookingToken(S, "b1", "accept", 1000);
    expect(checkBookingToken(S, "b1", "decline", t, 1000)).toBe(false);
    expect(checkBookingToken(S, "b2", "accept", t, 1000)).toBe(false);
    expect(checkBookingToken("y".repeat(40), "b1", "accept", t, 1000)).toBe(false);
  });
  it("rejects expired tokens", () => {
    const t = signBookingToken(S, "b1", "accept", 1000);
    expect(checkBookingToken(S, "b1", "accept", t, 1001 + BOOKING_TOKEN_TTL_SECONDS)).toBe(false);
  });
  it("refuses missing or short secrets instead of falling back", () => {
    expect(() => bookingSigningSecret({})).toThrow();
    expect(() => bookingSigningSecret({ BOOKING_SIGNING_SECRET: "short" })).toThrow();
  });
});
