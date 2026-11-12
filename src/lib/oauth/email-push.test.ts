import { describe, expect, it } from "vitest";
import { pushOutcome } from "./email-push";

const base = { consented: true, available: true, previous: "old@mail.be", next: "new@mail.be", delivery: "none" as const };

describe("pushOutcome", () => {
  it("reports notified only when the app's webhook confirmed", () =>
    expect(pushOutcome({ ...base, delivery: "ok" })).toBe("notified"));
  it("falls back to the next login when the app has no webhook", () =>
    expect(pushOutcome(base)).toBe("next_login"));
  it("reports a failed delivery separately", () =>
    expect(pushOutcome({ ...base, delivery: "failed" })).toBe("delivery_failed"));
  it("never sends anything to an app without e-mail consent", () =>
    expect(pushOutcome({ ...base, consented: false, delivery: "ok" })).toBe("no_consent"));
  it("does not count an app that already had the address", () =>
    expect(pushOutcome({ ...base, previous: "NEW@mail.be" })).toBe("unchanged"));
  it("reports an unavailable choice instead of falling back to another address", () =>
    expect(pushOutcome({ ...base, available: false })).toBe("unavailable"));
});
