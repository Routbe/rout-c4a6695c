import { describe, expect, it } from "vitest";
import { countdownParts, countdownTarget, isArchivedBlock, restoreArchivedBlock } from "./profile";

const NOW = Date.parse("2026-11-03T12:00:00.000Z");

describe("archive and countdown rules", () => {
  it("archives switched-off and expired blocks only", () => {
    expect(isArchivedBlock({ hidden: true }, NOW)).toBe(true);
    expect(isArchivedBlock({ expiresAt: "2026-11-03T11:59:00.000Z" }, NOW)).toBe(true);
    expect(isArchivedBlock({ expiresAt: "2026-11-04T00:00:00.000Z" }, NOW)).toBe(false);
    expect(isArchivedBlock({}, NOW)).toBe(false);
  });

  it("restoring clears an elapsed end date but keeps a future one", () => {
    expect(restoreArchivedBlock({ hidden: true, expiresAt: "2026-11-01T00:00:00.000Z" }, NOW)).toEqual({ hidden: false });
    expect(restoreArchivedBlock({ hidden: true, expiresAt: "2026-12-01T00:00:00.000Z" }, NOW)).toEqual({ hidden: false, expiresAt: "2026-12-01T00:00:00.000Z" });
  });

  it("countdown splits the remaining time and stops at zero", () => {
    const target = countdownTarget("2026-11-04T13:01:05.000Z");
    expect(target).not.toBeNull();
    expect(countdownParts(target ?? 0, NOW)).toEqual({ done: false, days: 1, hours: 1, minutes: 1, seconds: 5 });
    expect(countdownParts(NOW - 1, NOW).done).toBe(true);
    expect(countdownTarget("geen datum")).toBeNull();
  });

});
