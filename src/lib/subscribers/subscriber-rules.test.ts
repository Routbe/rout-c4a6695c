// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildSubscribersCsv, isSubscriberToken, normalizeSubscriberEmail } from "./subscriber-rules";
import {
  newSubscriberToken,
  openSubscriberEmail,
  sealSubscriberEmail,
  subscriberEmailHash,
} from "./subscriber-crypto.server";

process.env["SUBSCRIBER_ENCRYPTION_KEY"] = "test-key-test-key-test-key-test-key-0123456789";

describe("signup block privacy", () => {
  it("never stores the address in plain text and binds it to the owner", async () => {
    const sealed = await sealSubscriberEmail("ann@example.org", "owner-a", "root");
    expect(sealed.ciphertext).not.toContain("ann");
    expect(await openSubscriberEmail(sealed.ciphertext, sealed.iv, "owner-a", "root")).toBe("ann@example.org");
    // A row copied to another owner's profile does not decrypt.
    expect(await openSubscriberEmail(sealed.ciphertext, sealed.iv, "owner-b", "root")).toBeNull();
    expect(await openSubscriberEmail(sealed.ciphertext, sealed.iv, "owner-a", "alias")).toBeNull();
  });

  it("dedupes with a keyed hash that ignores case", async () => {
    const a = await subscriberEmailHash("Ann@Example.org");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await subscriberEmailHash("ann@example.org")).toBe(a);
  });

  it("issues url-safe one-time tokens", async () => {
    const t = await newSubscriberToken();
    expect(isSubscriberToken(t.token)).toBe(true);
    expect(t.hash).not.toBe(t.token);
  });

  it("CSV leaves out unsubscribed people and neutralises spreadsheet formulas", () => {
    const csv = buildSubscribersCsv([
      { email: "=cmd@x.be", handle: "jona", space: "root", status: "confirmed", createdAt: "2026-01-01T00:00:00.000Z", confirmedAt: null },
      { email: "gone@x.be", handle: "jona", space: "root", status: "unsubscribed", createdAt: "2026-01-01T00:00:00.000Z", confirmedAt: null },
      { email: "wait@x.be", handle: "jona", space: "alias", status: "pending", createdAt: "2026-01-01T00:00:00.000Z", confirmedAt: null },
    ]);
    expect(csv).toContain("'=cmd@x.be");
    expect(csv).not.toContain("gone@x.be");
    expect(csv).toContain("u/jona");
    expect(buildSubscribersCsv([{ email: "wait@x.be", handle: "j", space: "root", status: "pending", createdAt: "x", confirmedAt: null }], { confirmedOnly: true })).not.toContain("wait@x.be");
  });

  it("rejects malformed addresses", () => {
    expect(normalizeSubscriberEmail(" Ann@Example.ORG ")).toBe("ann@example.org");
    expect(normalizeSubscriberEmail("no-at-sign")).toBeNull();
  });
});
