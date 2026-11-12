import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_GUARD_TIMEOUT_MS, AuthTimeoutError, withAuthTimeout } from "@/lib/auth-timeout";

afterEach(() => vi.useRealTimers());
describe("session deadline", () => {
  it("settles a never-resolving session lookup after the configured deadline", async () => {
    vi.useFakeTimers();
    const lookup = withAuthTimeout(new Promise<null>(() => {}), "session", AUTH_GUARD_TIMEOUT_MS);
    const assertion = expect(lookup).rejects.toBeInstanceOf(AuthTimeoutError);
    await vi.advanceTimersByTimeAsync(AUTH_GUARD_TIMEOUT_MS);
    await assertion;
  });
});