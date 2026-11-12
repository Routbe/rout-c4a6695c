import { describe, expect, it } from "vitest";
import { canCancel, isDue, purgeAfter } from "./account-deletion-rules";

const DAY = 24 * 60 * 60 * 1000;
const t0 = Date.UTC(2026, 9, 30);
const row = { requestedAt: t0, purgeAfter: purgeAfter(t0), cancelledAt: null, completedAt: null };

describe("account deletion grace period", () => {
  it("purges exactly 7 days after the request", () => {
    expect(purgeAfter(t0) - t0).toBe(7 * DAY);
  });
  it("is not due on day 6 and can still be cancelled", () => {
    expect(isDue(row, t0 + 6 * DAY)).toBe(false);
    expect(canCancel(row, t0 + 6 * DAY)).toBe(true);
  });
  it("is due on day 7 and can no longer be cancelled", () => {
    expect(isDue(row, t0 + 7 * DAY)).toBe(true);
    expect(canCancel(row, t0 + 7 * DAY)).toBe(false);
  });
  it("a cancelled request is never purged", () => {
    expect(isDue({ ...row, cancelledAt: t0 + DAY }, t0 + 30 * DAY)).toBe(false);
  });
});
