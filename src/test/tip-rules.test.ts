import { describe, expect, it } from "vitest";
import { STRIPE_FULL_KEY_ERROR, TIP_MAX_IMAGES, checkStripeKey, cleanExternalValue, normalizeTipMethods } from "@/lib/tip-rules";

describe("support page rules", () => {
  it("refuses full Stripe secret keys", () => {
    expect(checkStripeKey("sk_live_abcdefghijklmnopqrstu")).toEqual({ ok: false, message: STRIPE_FULL_KEY_ERROR });
    expect(checkStripeKey("sk_test_abcdefghijklmnopqrstu").ok).toBe(false);
  });
  it("accepts restricted keys", () => {
    expect(checkStripeKey("rk_live_abcdefghijklmnopqrstu").ok).toBe(true);
  });
  it("allows at most 6 photos", () => {
    expect(TIP_MAX_IMAGES).toBe(6);
  });
  it("keeps method order and transfer always on", () => {
    const m = normalizeTipMethods([{ id: "links", enabled: true }, { id: "transfer", enabled: false }]);
    expect(m.map((x) => x.id)).toEqual(["links", "transfer", "psp"]);
    expect(m.find((x) => x.id === "transfer")?.enabled).toBe(true);
  });
  it("only accepts links on the real service host", () => {
    expect(cleanExternalValue("bunq", "https://bunq.me/jona")).toBe("jona");
    expect(cleanExternalValue("bunq", "https://evil.com/jona")).toBeNull();
  });
});
