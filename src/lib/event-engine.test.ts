// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const query = vi.hoisted(() => vi.fn());
vi.mock("./neon", () => ({ sql: query }));
import { eventInputSchema, eventVisibleOnProfile } from "./event-engine";
import { changeEvent, createEvent } from "./event-engine.server";
beforeEach(() => query.mockReset());
const now = new Date("2026-11-01T12:00:00Z");
const base = { title: "Concert", startsAt: "2026-11-02T19:00:00Z", profileSpace: "root" as const, profileHandle: "lola" };

describe("event rules", () => {
  it("hidden events are never shown on the profile", () => {
    expect(eventVisibleOnProfile({ published: false, startsAt: "2026-11-02T19:00:00Z", endsAt: null }, now)).toBe(false);
  });
  it("past events are not shown on the profile", () => {
    expect(eventVisibleOnProfile({ published: true, startsAt: "2026-10-30T19:00:00Z", endsAt: "2026-10-30T22:00:00Z" }, now)).toBe(false);
  });
  it("an event without end time stays visible for 4 hours after start", () => {
    expect(eventVisibleOnProfile({ published: true, startsAt: "2026-11-01T09:00:00Z", endsAt: null }, now)).toBe(true);
    expect(eventVisibleOnProfile({ published: true, startsAt: "2026-11-01T07:59:00Z", endsAt: null }, now)).toBe(false);
  });
  it("refuses an end before the start and non-https ticket links", () => {
    expect(eventInputSchema.safeParse({ ...base, endsAt: "2026-11-02T18:00:00Z" }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...base, ticketUrl: "http://x.be" }).success).toBe(false);
  });
  it("only the owner can attach an event to a profile", async () => {
    query.mockResolvedValue([]);
    await expect(createEvent("owner", null, { ...base, profileHandle: "someone-else" })).rejects.toThrow("Forbidden");
  });
  it("personal profiles cannot be used inside a workspace", async () => {
    await expect(createEvent("owner", "ws", base)).rejects.toThrow("Forbidden");
    expect(query).not.toHaveBeenCalled();
  });
  it("changing someone else's event is refused", async () => {
    query.mockResolvedValue([]);
    await expect(changeEvent("alice", null, "x", "delete")).rejects.toThrow("Forbidden");
  });
});
