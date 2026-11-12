import { vi } from "vitest";
vi.mock("@/lib/neon", () => ({ sql: () => Promise.resolve([]), withDbContext: (_: unknown, fn: () => unknown) => fn() }));
import { describe, expect, it } from "vitest";
import { bookableStarts } from "./bitmap";
import { applyHostConstraints, effectiveMaxDaysAhead, mergeHostStarts } from "./slot-rules";
import { holdCountdown } from "./hold-rules";
import type { EventTypeRules } from "./types";

const rules: EventTypeRules = {
  id: "t", workspaceId: null, durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0,
  minimumNoticeHours: 0, maxDaysAhead: 365, slotStepMinutes: 15, confirmationMode: "instant",
  priceCents: null, currency: "eur", routingStrategy: "STRICT", title: "T", locationKind: "video", locationValue: null,
};
const now = new Date("2026-01-01T00:00:00Z");
const free = (from: number, to: number) => "0".repeat(from) + "1".repeat(to - from) + "0".repeat(96 - to);
const day = (bits: string) => [{ day: "2026-02-02", bits }];
const hhmm = (ds: Date[]) => ds.map((d) => d.toISOString().slice(11, 16));

describe("gap-free starts (adjacent only)", () => {
  it("an empty 08:00–12:00 window offers only 08:00 and 11:30", () => {
    expect(hhmm(bookableStarts(day(free(32, 48)), { ...rules, adjacentOnly: true }, now))).toEqual(["08:00", "11:30"]);
  });

  it("a taken 10:00–10:30 adds 09:30 and 10:30 as gap-free starts", () => {
    const withBooking = free(32, 48).slice(0, 40) + "00" + free(32, 48).slice(42);
    expect(hhmm(bookableStarts(day(withBooking), { ...rules, adjacentOnly: true }, now))).toEqual(["08:00", "09:30", "10:30", "11:30"]);
  });

  it("buffers move the edge: 15 min after-buffer means the block must touch the next taken slot", () => {
    const r = { ...rules, bufferAfterMinutes: 15, adjacentOnly: true };
    expect(hhmm(bookableStarts(day(free(32, 48)), r, now))).toEqual(["08:00", "11:15"]);
  });

  it("without the option every free start stays", () => {
    expect(bookableStarts(day(free(32, 48)), rules, now)).toHaveLength(15);
  });
});

describe("horizon from the database", () => {
  it("the exclusive horizon end replaces max days ahead (it limits the start, like the database)", () => {
    const r = { ...rules, horizonEndUtc: new Date("2026-02-02T09:00:00Z") };
    expect(hhmm(bookableStarts(day(free(32, 48)), r, now))).toEqual(["08:00", "08:15", "08:30", "08:45"]);
  });

  it("business days need enough cached calendar days, capped at 365", () => {
    expect(effectiveMaxDaysAhead(30, null)).toBe(30);
    expect(effectiveMaxDaysAhead(7, 10)).toBe(16);
    expect(effectiveMaxDaysAhead(60, 10)).toBe(60);
    expect(effectiveMaxDaysAhead(30, 260)).toBe(365);
  });
});

describe("other visitors' holds and full periods", () => {
  const starts = bookableStarts(day(free(32, 48)), rules, now);

  it("a hold 09:00–09:30 removes every start whose block overlaps it", () => {
    const left = applyHostConstraints(starts, [{ kind: "busy", startUtc: new Date("2026-02-02T09:00:00Z"), endUtc: new Date("2026-02-02T09:30:00Z") }], rules);
    expect(hhmm(left)).not.toContain("08:45");
    expect(hhmm(left)).not.toContain("09:15");
    expect(hhmm(left)).toContain("08:30");
    expect(hhmm(left)).toContain("09:30");
  });

  it("a full day removes the starts inside it, not the day after", () => {
    const left = applyHostConstraints(starts, [{ kind: "limit", startUtc: new Date("2026-02-02T00:00:00Z"), endUtc: new Date("2026-02-02T10:00:00Z") }], rules);
    expect(hhmm(left)[0]).toBe("10:00");
  });

  it("a group session with seats left keeps only its own start, overlapping starts go", () => {
    const session = { kind: "session" as const, startUtc: new Date("2026-02-02T09:00:00Z"), endUtc: new Date("2026-02-02T09:30:00Z"),
      openStart: new Date("2026-02-02T09:00:00Z") };
    const left = hhmm(applyHostConstraints(starts, [session], rules));
    expect(left).toContain("09:00");
    expect(left).not.toContain("08:45");
    expect(left).not.toContain("09:15");
    expect(left).toContain("09:30");
  });

  it("a full group session removes its own start too", () => {
    const full = { kind: "session" as const, startUtc: new Date("2026-02-02T09:00:00Z"), endUtc: new Date("2026-02-02T09:30:00Z"), openStart: null };
    expect(hhmm(applyHostConstraints(starts, [full], rules))).not.toContain("09:00");
  });

  it("round robin still offers a start when only one host is held", () => {
    const byHost = new Map([[1, day(free(36, 38))], [2, day(free(36, 38))]]);
    const held = new Map([[1, [{ kind: "busy" as const, startUtc: new Date("2026-02-02T09:00:00Z"), endUtc: new Date("2026-02-02T09:30:00Z") }]]]);
    expect(hhmm(mergeHostStarts(byHost, 2, false, rules, now, held))).toEqual(["09:00"]);
    expect(mergeHostStarts(byHost, 2, true, rules, now, held)).toEqual([]);
  });
});

describe("reservation countdown", () => {
  it("shows minutes and seconds and expires at zero", () => {
    const exp = "2026-02-02T10:05:00.000Z";
    expect(holdCountdown(exp, Date.parse("2026-02-02T10:00:00Z")).label).toBe("5:00");
    expect(holdCountdown(exp, Date.parse("2026-02-02T10:04:01.500Z")).label).toBe("0:59");
    expect(holdCountdown(exp, Date.parse("2026-02-02T10:05:00Z")).expired).toBe(true);
    expect(holdCountdown(exp, Date.parse("2026-02-02T10:06:00Z")).seconds).toBe(0);
  });
});
