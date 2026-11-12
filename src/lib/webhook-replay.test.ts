import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { verifyStripeSignature, withinReplayWindow } from "./webhook-replay";

const secret = "whsec_test";
const body = '{"id":"evt_1"}';
const sign = (t: number) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
const now = 1_800_000_000_000;

describe("webhook replay protection", () => {
  it("accepts a fresh signed Stripe event", () => expect(verifyStripeSignature(body, sign(now / 1000 - 10), secret, now)).toBe(true));
  it("refuses a correctly signed event older than 300 s", () => expect(verifyStripeSignature(body, sign(now / 1000 - 301), secret, now)).toBe(false));
  it("refuses a bad signature", () => expect(verifyStripeSignature(body, sign(now / 1000) + "00", secret, now)).toBe(false));
  it("window is 300 seconds both ways", () => {
    expect(withinReplayWindow(now / 1000 + 300, now)).toBe(true);
    expect(withinReplayWindow(now / 1000 + 301, now)).toBe(false);
    expect(withinReplayWindow(0, now)).toBe(false);
  });
});
