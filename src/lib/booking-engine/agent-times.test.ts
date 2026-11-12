import { describe, expect, it } from "vitest";
import { AGENT_MAX_TIMES, agentBookingTimes } from "./agent-times";

const now = new Date("2026-03-27T08:00:00Z");
const page = "https://rout.be/book/04cc9638-ebd9-4657-a1fb-c7869e123eae";

describe("MCP booking times", () => {
  it("groups free times per day on the requested wall clock, with a link that preselects the time", () => {
    const r = agentBookingTimes({ slots: ["2026-03-27T23:30:00Z", "2026-03-27T09:00:00Z"], timeZone: "Europe/Brussels", now, bookingPage: page });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.days).toEqual([
      { date: "2026-03-27", times: [{ start_utc: "2026-03-27T09:00:00.000Z", local_time: "10:00", booking_url: `${page}?start=2026-03-27T09%3A00%3A00.000Z` }] },
      { date: "2026-03-28", times: [{ start_utc: "2026-03-27T23:30:00.000Z", local_time: "00:30", booking_url: `${page}?start=2026-03-27T23%3A30%3A00.000Z` }] },
    ]);
  });

  it("follows the DST jump in the visitor's zone (Brussels, 29 March 2026)", () => {
    const r = agentBookingTimes({ slots: ["2026-03-28T09:00:00Z", "2026-03-30T08:00:00Z"], timeZone: "Europe/Brussels", now, bookingPage: page });
    if (!r.ok) throw new Error(r.error);
    expect(r.days.map((d) => d.times[0]!.local_time)).toEqual(["10:00", "10:00"]);
  });

  it("defaults to 7 days from today and never looks into the past", () => {
    const r = agentBookingTimes({ slots: ["2026-04-02T09:00:00Z", "2026-04-03T09:00:00Z"], fromDate: "2026-01-01", now, bookingPage: page });
    if (!r.ok) throw new Error(r.error);
    expect(r.from_date).toBe("2026-03-27");
    expect(r.to_date).toBe("2026-04-02");
    expect(r.days.map((d) => d.date)).toEqual(["2026-04-02"]);
  });

  it("allows at most 14 days and rejects impossible dates and zones", () => {
    expect(agentBookingTimes({ slots: [], days: 15, now, bookingPage: page })).toEqual({ ok: false, error: "invalid_days" });
    expect(agentBookingTimes({ slots: [], days: 0, now, bookingPage: page })).toEqual({ ok: false, error: "invalid_days" });
    expect(agentBookingTimes({ slots: [], days: 14, now, bookingPage: page }).ok).toBe(true);
    expect(agentBookingTimes({ slots: [], fromDate: "2026-02-30", now, bookingPage: page })).toEqual({ ok: false, error: "invalid_from_date" });
    expect(agentBookingTimes({ slots: [], timeZone: "Mars/Olympus", now, bookingPage: page })).toEqual({ ok: false, error: "invalid_time_zone" });
  });

  it("returns at most 60 times and says when it cut the list", () => {
    const slots = Array.from({ length: 80 }, (_, i) => new Date(Date.parse("2026-03-27T09:00:00Z") + i * 15 * 60000).toISOString());
    const r = agentBookingTimes({ slots, timeZone: "UTC", now, bookingPage: page });
    if (!r.ok) throw new Error(r.error);
    expect(r.days.flatMap((d) => d.times)).toHaveLength(AGENT_MAX_TIMES);
    expect(AGENT_MAX_TIMES).toBe(60);
    expect(r.truncated).toBe(true);
  });
});
