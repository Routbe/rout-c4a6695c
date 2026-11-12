import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, expiresAtFor, presencePayloadSchema, visibleStatus, type StoredStatus } from "./custom-presence";

const status: StoredStatus = { statusText: "In een meeting", icon: null, category: "custom", expiresAt: null };
// Wednesday 2026-10-28 10:00 UTC = 11:00 Brussels
const wed11 = new Date("2026-10-28T10:00:00Z");

describe("custom presence rules", () => {
  it("expires a status after the chosen duration (1 hour)", () => {
    const s = { ...status, expiresAt: expiresAtFor(60, wed11) };
    expect(visibleStatus(s, DEFAULT_RULES, new Date(wed11.getTime() + 59 * 60_000))).not.toBeNull();
    expect(visibleStatus(s, DEFAULT_RULES, new Date(wed11.getTime() + 60 * 60_000))).toBeNull();
  });
  it("hides the status on a stealth day", () => {
    expect(visibleStatus(status, { ...DEFAULT_RULES, stealthDays: [3] }, wed11)).toBeNull();
  });
  it("hides the status outside working hours", () => {
    const rules = { ...DEFAULT_RULES, workStart: 9, workEnd: 17 };
    expect(visibleStatus(status, rules, wed11)).not.toBeNull();
    expect(visibleStatus(status, rules, new Date("2026-10-28T17:30:00Z"))).toBeNull();
  });
  it("masks explicit tracks when the filter is on", () => {
    expect(visibleStatus({ ...status, explicit: true }, { ...DEFAULT_RULES, hideExplicit: true }, wed11)).toBeNull();
    expect(visibleStatus({ ...status, explicit: true }, DEFAULT_RULES, wed11)).not.toBeNull();
  });
  it("rejects an empty status and unknown categories", () => {
    expect(presencePayloadSchema.safeParse({ status_text: "" }).success).toBe(false);
    expect(presencePayloadSchema.safeParse({ status_text: "Coding", category: "sleeping" }).success).toBe(false);
    expect(presencePayloadSchema.safeParse({ status_text: "Coding", category: "coding", expires_in_minutes: 60 }).success).toBe(true);
  });
});
