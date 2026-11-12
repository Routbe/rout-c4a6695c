import { describe, expect, it } from "vitest";
import { computeDays, bookableStarts, andBits, expandRules } from "./bitmap";
import { roundRobinOrder, collectiveDay } from "./routing";
import { buildIcs } from "./ics";
import { parseIcsBusy } from "./adapters/ics-parse";
import { toBusyBlocks } from "./adapters/zero-knowledge";
import { isSlotTakenError } from "./book.server";
import { zonedToUtc } from "./time";
import type { EventTypeRules } from "./types";

const brussels9to17Mon = [{ weekday: 1, startMinute: 540, endMinute: 1020, timezone: "Europe/Brussels" }];

describe("timezones", () => {
  it("Brussels 09:00 is 07:00Z in summer and 08:00Z in winter", () => {
    expect(zonedToUtc(2026, 7, 6, 540, "Europe/Brussels").toISOString()).toBe("2026-07-06T07:00:00.000Z");
    expect(zonedToUtc(2026, 11, 2, 540, "Europe/Brussels").toISOString()).toBe("2026-11-02T08:00:00.000Z");
  });
  it("rule on the Monday after the DST switch (2026-10-26) follows winter time", () => {
    const ivs = expandRules(brussels9to17Mon, new Date("2026-10-26T00:00:00Z"), new Date("2026-10-27T00:00:00Z"));
    expect(ivs.map((i) => i.startUtc.toISOString())).toEqual(["2026-10-26T08:00:00.000Z"]);
  });
});

const et: EventTypeRules = {
  id: "x", workspaceId: null, durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 15,
  minimumNoticeHours: 2, maxDaysAhead: 30, slotStepMinutes: 30, confirmationMode: "instant", priceCents: null,
  currency: "eur", routingStrategy: "STRICT", title: "t", locationKind: "video", locationValue: null,
};

describe("bitmap", () => {
  const days = computeDays({
    rules: brussels9to17Mon, freeOverrides: [],
    busy: [{ startUtc: new Date("2026-11-02T10:00:00Z"), endUtc: new Date("2026-11-02T11:00:00Z") }],
    fromDay: new Date("2026-11-02T00:00:00Z"), days: 1,
  });
  it("free 08:00–16:00Z with 10–11Z busy", () => {
    const b = days[0]!.bits;
    expect(b.slice(32, 40)).toBe("11111111");
    expect(b.slice(40, 44)).toBe("0000");
    expect(b[31]).toBe("0");
    expect(b[64]).toBe("0");
  });
  it("after-buffer blocks the 09:30Z start, notice blocks too-early starts", () => {
    const starts = bookableStarts(days, et, new Date("2026-11-02T06:30:00Z")).map((d) => d.toISOString().slice(11, 16));
    expect(starts[0]).toBe("08:30");
    expect(starts).not.toContain("09:30");
    expect(starts).toContain("11:00");
    expect(starts).not.toContain("15:45");
  });
});

describe("routing", () => {
  it("round robin picks the free host with fewest bookings, ties by priority then id", () => {
    expect(roundRobinOrder([
      { userId: "b", priority: 0, bookingsThisMonth: 3, isFree: true },
      { userId: "a", priority: 0, bookingsThisMonth: 1, isFree: false },
      { userId: "c", priority: 5, bookingsThisMonth: 3, isFree: true },
      { userId: "d", priority: 0, bookingsThisMonth: 2, isFree: true },
    ])).toEqual(["d", "c", "b"]);
  });
  it("collective is a bitwise AND, missing host day = busy", () => {
    const a = "1".repeat(48) + "0".repeat(48);
    const b = "0".repeat(24) + "1".repeat(72);
    expect(collectiveDay([a, b])).toBe(andBits([a, b]));
    expect(collectiveDay([a, b]).indexOf("1")).toBe(24);
    expect(collectiveDay([a, undefined])).not.toContain("1");
  });
});

describe("ics", () => {
  it("builds a UTC invite with CRLF and escaped text", () => {
    const ics = buildIcs({ uid: "u1@rout.be", sequence: 0, method: "REQUEST", startUtc: new Date("2026-11-02T08:00:00Z"),
      endUtc: new Date("2026-11-02T08:30:00Z"), summary: "Intake, kort", organizerEmail: "o@rout.be", attendeeEmail: "g@x.be", now: new Date("2026-10-01T00:00:00Z") });
    expect(ics).toContain("DTSTART:20261102T080000Z\r\n");
    expect(ics).toContain("SUMMARY:Intake\\, kort");
    expect(ics).toContain("METHOD:REQUEST");
  });
});

const FEED = [
  "BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:secret-uid-1", "SUMMARY:Therapie bij Dr. X", "DESCRIPTION:prive",
  "ATTENDEE:mailto:someone@example.com", "LOCATION:Thuis", "DTSTART;TZID=Europe/Brussels:20261102T100000",
  "DTEND;TZID=Europe/Brussels:20261102T110000", "END:VEVENT",
  "BEGIN:VEVENT", "UID:w", "DTSTART:20261103T120000Z", "DURATION:PT30M", "RRULE:FREQ=WEEKLY;COUNT=3", "TRANSP:TRANSPARENT", "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("zero-knowledge adapters", () => {
  it("parses TZID and weekly RRULE", () => {
    const raw = parseIcsBusy(FEED, new Date("2026-11-01T00:00:00Z"), new Date("2026-12-01T00:00:00Z"));
    expect(raw[0]!.startUtc.toISOString()).toBe("2026-11-02T09:00:00.000Z");
    expect(raw.filter((r) => r.externalId === "w")).toHaveLength(3);
  });
  it("emits only hashed id, start, end and blocking — no PII", async () => {
    const raw = parseIcsBusy(FEED, new Date("2026-11-01T00:00:00Z"), new Date("2026-12-01T00:00:00Z"));
    const blocks = await toBusyBlocks(raw, "k", "cal-1");
    for (const b of blocks) {
      expect(Object.keys(b).sort()).toEqual(["endUtc", "isBlocking", "providerId", "startUtc"]);
      expect(b.providerId).toMatch(/^[0-9a-f]{64}$/);
    }
    const dump = JSON.stringify(blocks);
    for (const pii of ["Therapie", "prive", "someone@example.com", "Thuis", "secret-uid-1"]) expect(dump).not.toContain(pii);
    expect(blocks.find((b) => b.startUtc.toISOString() === "2026-11-03T12:00:00.000Z")!.isBlocking).toBe(false);
  });
});

describe("concurrency mapping", () => {
  it("maps exclusion and assert errors to slot_taken", () => {
    expect(isSlotTakenError({ code: "23P01" })).toBe(true);
    expect(isSlotTakenError(new Error("Neon 400 P0001: slot_taken"))).toBe(true);
    expect(isSlotTakenError(new Error("syntax error"))).toBe(false);
  });
});
