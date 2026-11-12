import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The token check itself lives in the database (db/0216 rout_booking_guest_view,
 * covered by booking-boundary-postgres.test.ts). Here: the server forwards the
 * token to that check and never turns a masked answer into details.
 */
const FULL = {
  id: "b1", status: "confirmed", masked: false, title: "Kennismaking",
  startUtc: "2026-11-05T14:00:00Z", endUtc: "2026-11-05T14:30:00Z", guestName: "Gast Persoon",
  guestEmail: "gast@example.com", guestTimezone: "Europe/Brussels", locationKind: "video",
  locationValue: "https://meet.example/xyz", hostName: "Host", icsUid: "u@rout.be", sequence: 0,
};

const sqlMock = vi.fn();
vi.mock("@/lib/neon", () => ({ sql: (...args: unknown[]) => sqlMock(...args), withDbContext: (_: unknown, fn: () => unknown) => fn() }));

import { bookingSummary } from "./public.server";

beforeEach(() => sqlMock.mockReset());

describe("bookingSummary PII-afscherming (db/0144, db/0216)", () => {
  it("geeft het token door aan de databasecontrole, nooit zelf vergeleken", async () => {
    sqlMock.mockResolvedValue([{ v: { id: "b1", status: "confirmed", masked: true } }]);
    await bookingSummary("b1", "a".repeat(64));
    const values = sqlMock.mock.calls[0]!.slice(1);
    expect(values).toContain("a".repeat(64));
  });

  it("een gemaskerd antwoord bevat alleen de status", async () => {
    sqlMock.mockResolvedValue([{ v: { id: "b1", status: "confirmed", masked: true } }]);
    const s = await bookingSummary("b1");
    expect(s!.masked).toBe(true);
    expect(s!.status).toBe("confirmed");
    for (const k of ["guestName", "guestTimezone", "locationValue", "startUtc", "title"] as const) expect(s![k]).toBeNull();
  });

  it("toont de gast-bevestiging als de database het token aanvaardt", async () => {
    sqlMock.mockResolvedValue([{ v: FULL }]);
    const s = await bookingSummary("b1", "a".repeat(64));
    expect(s!.masked).toBe(false);
    expect(s!.guestName).toBe("Gast Persoon");
    expect(s!.locationValue).toBe("https://meet.example/xyz");
  });

  it("geeft null bij een onbekende boeking", async () => {
    sqlMock.mockResolvedValue([{ v: null }]);
    expect(await bookingSummary("onbekend")).toBeNull();
  });
});
