import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/better-auth.server", () => ({ resolveAuthSecret: () => ({ secret: "x".repeat(40) }) }));
import { signReviewToken, verifyReviewToken } from "./review-links.server";

const key = "k".repeat(40);
describe("review links", () => {
  it("rejects tampered tokens", async () => {
    const t = await signReviewToken({ k: "influencer", r: "abc", a: "reject" }, { key });
    const [body, sig] = t.split(".");
    const forged = btoa(JSON.stringify({ k: "influencer", r: "abc", a: "approve", e: Date.now() + 1e9 })).replace(/=+$/, "");
    expect(await verifyReviewToken(`${forged}.${sig}`, { key })).toBeNull();
    expect((await verifyReviewToken(`${body}.${sig}`, { key }))?.a).toBe("reject");
  });
  it("expires after 14 days", async () => {
    const t = await signReviewToken({ k: "business", r: "abc", a: "approve" }, { key, now: 0 });
    expect(await verifyReviewToken(t, { key, now: 15 * 86_400_000 })).toBeNull();
  });
});
