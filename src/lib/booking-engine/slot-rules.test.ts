import { vi } from "vitest";
vi.mock("@/lib/neon", () => ({ sql: () => Promise.resolve([]), withDbContext: (_: unknown, fn: () => unknown) => fn() }));
import { describe, expect, it } from "vitest";
import { mergeHostStarts, contiguousDays } from "./slot-rules";
import { zonedToUtc } from "./time";
import type { EventTypeRules } from "./types";

const rules: EventTypeRules = {
  id: "t", workspaceId: "w", durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0,
  minimumNoticeHours: 0, maxDaysAhead: 365, slotStepMinutes: 15, confirmationMode: "instant",
  priceCents: null, currency: "eur", routingStrategy: "ROUND_ROBIN", title: "T", locationKind: "video", locationValue: null,
};
const now = new Date("2026-01-01T00:00:00Z");
const bitsFree = (from: number, to: number) => "0".repeat(from) + "1".repeat(to - from) + "0".repeat(96 - to);

describe("team slots", () => {
  it("never stitches two hosts' partial free time into one slot", () => {
    // Host 1 free 10:00–10:15, host 2 free 10:15–10:30 → no 30-minute slot.
    const byHost = new Map([
      [1, [{ day: "2026-02-02", bits: bitsFree(40, 41) }]],
      [2, [{ day: "2026-02-02", bits: bitsFree(41, 42) }]],
    ]);
    expect(mergeHostStarts(byHost, 2, false, rules, now)).toEqual([]);
  });

  it("round robin offers any start one host can take alone", () => {
    const byHost = new Map([
      [1, [{ day: "2026-02-02", bits: bitsFree(40, 42) }]],
      [2, [{ day: "2026-02-02", bits: bitsFree(44, 46) }]],
    ]);
    expect(mergeHostStarts(byHost, 2, false, rules, now).map((d) => d.toISOString())).toEqual([
      "2026-02-02T10:00:00.000Z", "2026-02-02T11:00:00.000Z",
    ]);
  });

  it("collective offers only starts every host can take; a host without cache blocks all", () => {
    const byHost = new Map([
      [1, [{ day: "2026-02-02", bits: bitsFree(40, 44) }]],
      [2, [{ day: "2026-02-02", bits: bitsFree(42, 46) }]],
    ]);
    expect(mergeHostStarts(byHost, 2, true, rules, now).map((d) => d.toISOString())).toEqual(["2026-02-02T10:30:00.000Z"]);
    expect(mergeHostStarts(byHost, 3, true, rules, now)).toEqual([]);
  });

  it("missing days inside the range count as busy", () => {
    const days = contiguousDays([{ day: "2026-02-01", bits: bitsFree(0, 96) }, { day: "2026-02-03", bits: bitsFree(0, 96) }]);
    expect(days.map((d) => d.day)).toEqual(["2026-02-01", "2026-02-02", "2026-02-03"]);
    expect(days[1]!.bits).not.toContain("1");
  });
});

describe("wall time to UTC (RFC 5545)", () => {
  it("normal winter and summer times in Brussels", () => {
    expect(zonedToUtc(2026, 1, 15, 9 * 60, "Europe/Brussels").toISOString()).toBe("2026-01-15T08:00:00.000Z");
    expect(zonedToUtc(2026, 7, 15, 9 * 60, "Europe/Brussels").toISOString()).toBe("2026-07-15T07:00:00.000Z");
  });

  it("a time in the spring-forward gap moves forward (02:30 → 03:30 CEST)", () => {
    expect(zonedToUtc(2026, 3, 29, 150, "Europe/Brussels").toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });

  it("an ambiguous fall-back time takes the first occurrence (02:30 CEST)", () => {
    expect(zonedToUtc(2026, 10, 25, 150, "Europe/Brussels").toISOString()).toBe("2026-10-25T00:30:00.000Z");
  });

  it("southern hemisphere and half-hour zones", () => {
    expect(zonedToUtc(2026, 1, 10, 9 * 60, "Australia/Sydney").toISOString()).toBe("2026-01-09T22:00:00.000Z");
    expect(zonedToUtc(2026, 1, 10, 9 * 60, "America/St_Johns").toISOString()).toBe("2026-01-10T12:30:00.000Z");
    expect(zonedToUtc(2026, 1, 10, 9 * 60, "Asia/Kolkata").toISOString()).toBe("2026-01-10T03:30:00.000Z");
  });
});

import { parseIcsBusy } from "./adapters/ics-parse";

const feed = (...lines: string[]) => ["BEGIN:VCALENDAR", ...lines, "END:VCALENDAR"].join("\r\n");

describe("external calendar recurrence (RFC 5545)", () => {
  it("a weekly 10:00 Brussels meeting stays at 10:00 local across the DST change", () => {
    const raw = parseIcsBusy(feed("BEGIN:VEVENT", "UID:a", "DTSTART;TZID=Europe/Brussels:20261019T100000",
      "DTEND;TZID=Europe/Brussels:20261019T110000", "RRULE:FREQ=WEEKLY;COUNT=3", "END:VEVENT"),
      new Date("2026-10-01T00:00:00Z"), new Date("2026-12-01T00:00:00Z"));
    expect(raw.map((r) => r.startUtc.toISOString())).toEqual([
      "2026-10-19T08:00:00.000Z", "2026-10-26T09:00:00.000Z", "2026-11-02T09:00:00.000Z",
    ]);
  });

  it("supports monthly rules such as the first Monday", () => {
    const raw = parseIcsBusy(feed("BEGIN:VEVENT", "UID:m", "DTSTART;TZID=Europe/Brussels:20260105T090000",
      "DURATION:PT1H", "RRULE:FREQ=MONTHLY;BYDAY=1MO;COUNT=3", "END:VEVENT"),
      new Date("2026-01-01T00:00:00Z"), new Date("2026-06-01T00:00:00Z"));
    expect(raw.map((r) => r.startUtc.toISOString())).toEqual([
      "2026-01-05T08:00:00.000Z", "2026-02-02T08:00:00.000Z", "2026-03-02T08:00:00.000Z",
    ]);
  });

  it("EXDATE removes an occurrence and RECURRENCE-ID moves one", () => {
    const raw = parseIcsBusy(feed(
      "BEGIN:VEVENT", "UID:s", "DTSTART;TZID=Europe/Brussels:20260202T100000", "DURATION:PT30M",
      "RRULE:FREQ=DAILY;COUNT=4", "EXDATE;TZID=Europe/Brussels:20260203T100000", "END:VEVENT",
      "BEGIN:VEVENT", "UID:s", "RECURRENCE-ID;TZID=Europe/Brussels:20260204T100000",
      "DTSTART;TZID=Europe/Brussels:20260204T150000", "DURATION:PT30M", "END:VEVENT"),
      new Date("2026-02-01T00:00:00Z"), new Date("2026-03-01T00:00:00Z"));
    expect(raw.map((r) => r.startUtc.toISOString()).sort()).toEqual([
      "2026-02-02T09:00:00.000Z", "2026-02-04T14:00:00.000Z", "2026-02-05T09:00:00.000Z",
    ]);
  });

  it("UNTIL in UTC is honoured on real instants", () => {
    const raw = parseIcsBusy(feed("BEGIN:VEVENT", "UID:u", "DTSTART;TZID=Europe/Brussels:20260202T100000", "DURATION:PT30M",
      "RRULE:FREQ=DAILY;UNTIL=20260204T090000Z", "END:VEVENT"),
      new Date("2026-02-01T00:00:00Z"), new Date("2026-03-01T00:00:00Z"));
    expect(raw).toHaveLength(3);
  });
});

import { horizonFor } from "./recompute.server";

describe("availability cache horizon", () => {
  it("covers the furthest bookable day of the host's types, between 30 and 366 days", () => {
    expect(horizonFor([])).toBe(30);
    expect(horizonFor([14])).toBe(30);
    expect(horizonFor([90, 30])).toBe(91);
    expect(horizonFor([365])).toBe(366);
  });
});
