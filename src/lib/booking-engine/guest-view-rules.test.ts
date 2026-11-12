import { describe, expect, it } from "vitest";
import {
  addDays,
  canonicalZone,
  dayPeriod,
  defaultHourCycle,
  formatOffset,
  formatSlotTime,
  groupByPeriod,
  groupSlotsByDay,
  isValidTimeZone,
  matchesZone,
  monthGrid,
  monthsBetween,
  timezoneOptions,
  weekStartFor,
  zoneOffset,
} from "./guest-view-rules";

describe("slots per day follow the visitor's time zone", () => {
  const slots = ["2026-11-12T23:30:00Z", "2026-11-12T09:00:00Z", "2026-11-13T08:00:00Z"];
  it("23:30 UTC is still the 12th in London but already the 13th in Brussels", () => {
    expect([...groupSlotsByDay(slots, "Europe/London").keys()]).toEqual([
      "2026-11-12",
      "2026-11-13",
    ]);
    expect(groupSlotsByDay(slots, "Europe/London").get("2026-11-12")).toEqual([
      "2026-11-12T09:00:00Z",
      "2026-11-12T23:30:00Z",
    ]);
    expect(groupSlotsByDay(slots, "Europe/Brussels").get("2026-11-13")).toEqual([
      "2026-11-12T23:30:00Z",
      "2026-11-13T08:00:00Z",
    ]);
  });
  it("in Tokyo the same instants fall on other days", () => {
    expect([...groupSlotsByDay(slots, "Asia/Tokyo").keys()]).toEqual(["2026-11-12", "2026-11-13"]);
    expect(groupSlotsByDay(slots, "Asia/Tokyo").get("2026-11-13")).toEqual([
      "2026-11-12T23:30:00Z",
      "2026-11-13T08:00:00Z",
    ]);
  });
});

describe("morning, afternoon, evening on the wall clock", () => {
  it("splits at 12:00 and 17:00 local time, including across DST", () => {
    expect(dayPeriod("2026-07-01T09:59:00Z", "Europe/Brussels")).toBe("morning"); // 11:59 summer time
    expect(dayPeriod("2026-07-01T10:00:00Z", "Europe/Brussels")).toBe("afternoon"); // 12:00
    expect(dayPeriod("2026-11-12T16:00:00Z", "Europe/Brussels")).toBe("evening"); // 17:00 winter time
    expect(dayPeriod("2026-11-12T15:59:00Z", "Europe/Brussels")).toBe("afternoon");
  });
  it("leaves empty groups out and keeps the order", () => {
    const g = groupByPeriod(["2026-11-12T17:00:00Z", "2026-11-12T08:00:00Z"], "UTC");
    expect(g.map((x) => x.period)).toEqual(["morning", "evening"]);
  });
});

describe("12 or 24 hours", () => {
  it("defaults to the locale's own clock", () => {
    expect(defaultHourCycle("en-US")).toBe("h12");
    expect(defaultHourCycle("nl")).toBe("h23");
    expect(defaultHourCycle("de")).toBe("h23");
    expect(defaultHourCycle("fr")).toBe("h23");
  });
  it("shows the chosen clock in the chosen zone", () => {
    expect(formatSlotTime("2026-11-12T14:30:00Z", "en-US", "Europe/Brussels", "h12")).toMatch(
      /^3:30\sPM$/,
    );
    expect(formatSlotTime("2026-11-12T14:30:00Z", "en-US", "Europe/Brussels", "h23")).toBe("15:30");
    expect(formatSlotTime("2026-11-12T14:30:00Z", "nl", "America/New_York", "h23")).toBe("09:30");
  });
});

describe("month grid", () => {
  it("November 2026 starts on a Sunday: Monday weeks lead with 6 October days", () => {
    const g = monthGrid("2026-11", 1);
    expect(g[0]![0]).toEqual({ day: "2026-10-26", inMonth: false });
    expect(g[0]![6]).toEqual({ day: "2026-11-01", inMonth: true });
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(g[g.length - 1]![6]!.day).toBe("2026-12-06");
  });
  it("Sunday weeks start on the 1st itself", () => {
    expect(monthGrid("2026-11", 0)[0]![0]).toEqual({ day: "2026-11-01", inMonth: true });
  });
  it("February in a leap year has 29 days", () => {
    const days = monthGrid("2028-02", 1)
      .flat()
      .filter((c) => c.inMonth);
    expect(days).toHaveLength(29);
  });
  it("lists every month between two days, across a year end", () => {
    expect(monthsBetween("2026-11-12", "2027-02-01")).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
    expect(monthsBetween("2026-11-12", "2026-11-30")).toEqual(["2026-11"]);
  });
  it("moves days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("European locales start on Monday, en-US on Sunday", () => {
    expect(weekStartFor("nl")).toBe(1);
    expect(weekStartFor("fr")).toBe(1);
    expect(weekStartFor("de")).toBe(1);
    expect(weekStartFor("en-US")).toBe(0);
  });
});

describe("time-zone list", () => {
  const at = new Date("2026-11-12T12:00:00Z");
  it("labels offsets, including half and quarter hours", () => {
    expect(formatOffset(0)).toBe("GMT");
    expect(formatOffset(60)).toBe("GMT+1");
    expect(formatOffset(-210)).toBe("GMT-3:30");
    expect(formatOffset(345)).toBe("GMT+5:45");
  });
  it("knows the offset on the given date (Brussels +1 in winter, +2 in summer)", () => {
    expect(zoneOffset("Europe/Brussels", at)).toBe(60);
    expect(zoneOffset("Europe/Brussels", new Date("2026-07-01T12:00:00Z"))).toBe(120);
    expect(zoneOffset("Asia/Kathmandu", at)).toBe(345);
  });
  it("is sorted by offset and always contains UTC and the extra zones", () => {
    const list = timezoneOptions(at, ["Europe/Brussels", "Not/AZone"]);
    expect(list.some((z) => z.id === "UTC")).toBe(true);
    expect(list.some((z) => z.id === "Europe/Brussels")).toBe(true);
    expect(list.some((z) => z.id === "Not/AZone")).toBe(false);
    for (let i = 1; i < list.length; i++)
      expect(list[i]!.offsetMinutes).toBeGreaterThanOrEqual(list[i - 1]!.offsetMinutes);
  });
  it("search finds a city, a region, an offset, ignoring case and accents", () => {
    const list = timezoneOptions(at);
    const ids = (q: string) => list.filter((z) => matchesZone(z, q)).map((z) => z.id);
    expect(ids("brus")).toContain("Europe/Brussels");
    expect(ids("NEW YORK")).toContain("America/New_York");
    expect(ids("gmt+5:45")).toContain("Asia/Kathmandu");
    expect(ids("utc+1")).toContain("Europe/Brussels");
    expect(ids("bogotá")).toContain("America/Bogota");
  });
  it("uses current names, never both spellings", () => {
    const ids = timezoneOptions(at, ["Asia/Calcutta"]).map((z) => z.id);
    expect(ids).toContain("Asia/Kolkata");
    expect(ids).not.toContain("Asia/Calcutta");
    expect(ids).toContain("Europe/Kyiv");
    expect(ids).not.toContain("Europe/Kiev");
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("accepts only real zones", () => {
    expect(isValidTimeZone("Europe/Brussels")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
    expect(canonicalZone("Asia/Katmandu")).toBe("Asia/Kathmandu");
    expect(canonicalZone("Europe/Brussels")).toBe("Europe/Brussels");
  });
});
