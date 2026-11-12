import { describe, expect, it } from "vitest";
import { MAX_ATTEMPTS, nextRetryDelaySec, signWebhook, verifyWebhook } from "./signature";

describe("X-Rout-Signature", () => {
  it("round-trips and binds body and secret", async () => {
    const h = await signWebhook("s3cret", '{"a":1}', 1000);
    expect(h).toMatch(/^t=1000,v1=[0-9a-f]{64}$/);
    expect(await verifyWebhook("s3cret", '{"a":1}', h, 1100)).toBe(true);
    expect(await verifyWebhook("s3cret", '{"a":2}', h, 1100)).toBe(false);
    expect(await verifyWebhook("other", '{"a":1}', h, 1100)).toBe(false);
  });
  it("rejects signatures older than 5 minutes", async () => {
    const h = await signWebhook("s", "x", 1000);
    expect(await verifyWebhook("s", "x", h, 1301)).toBe(false);
  });
  it("backs off exponentially and stops after the max attempts", () => {
    expect(nextRetryDelaySec(1)).toBe(30);
    expect(nextRetryDelaySec(2)).toBe(60);
    expect(nextRetryDelaySec(3)).toBe(120);
    expect(nextRetryDelaySec(MAX_ATTEMPTS)).toBeNull();
  });
});
