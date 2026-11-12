import { describe, expect, it } from "vitest";
import {
  checkVersion1Canvas,
  checkSlugCanvas,
  limitsFor,
  shortLinkBlockReason,
  studioTier,
} from "./studio-limits";

describe("studioTier", () => {
  it("treats anonymous visitors as guests", () => {
    expect(studioTier({ signedIn: false })).toBe("guest");
  });

  it("treats plain accounts as members and verified/paid as verified", () => {
    expect(studioTier({ signedIn: true })).toBe("member");
    expect(studioTier({ signedIn: true, verified: true })).toBe("verified");
    expect(studioTier({ signedIn: true, isPaid: true })).toBe("verified");
    expect(studioTier({ signedIn: true, isEarlyBeliever: true })).toBe("verified");
  });
});

describe("shortLinkBlockReason", () => {
  it("blocks guests entirely", () => {
    expect(shortLinkBlockReason({ signedIn: false }, 0)).toMatch(/meld je aan/i);
  });

  it("blocks members past their quota", () => {
    const limits = limitsFor({ signedIn: true });
    expect(shortLinkBlockReason({ signedIn: true }, limits.maxShortLinks - 1)).toBeNull();
    expect(shortLinkBlockReason({ signedIn: true }, limits.maxShortLinks)).toMatch(/maximum/i);
  });

  it("reserves vanity codes for verified accounts", () => {
    expect(shortLinkBlockReason({ signedIn: true }, 0, true)).toMatch(/geverifieerd/i);
    expect(shortLinkBlockReason({ signedIn: true, verified: true }, 0, true)).toBeNull();
  });
});

describe("checkVersion1Canvas", () => {
  it("accepts a 4-character Base36 code on rout.be", () => {
    const check = checkSlugCanvas("A89K");
    expect(check.modules).toBe(21);
    expect(check.version).toBe(1);
    expect(check.isVersion1).toBe(true);
    expect(check.fits).toBe(true);
    expect(check.length).toBe(20);
    expect(check.reason).toBeNull();
  });

  it("scales to a higher version instead of failing", () => {
    const check = checkVersion1Canvas("HTTPS://ROUT.BE/A89K1");
    expect(check.fits).toBe(true);
    expect(check.version).toBe(2);
    expect(check.isVersion1).toBe(false);
    expect(check.reason).toMatch(/Version 2/);
  });

  it("uses byte-mode capacity for lowercase payloads", () => {
    const check = checkVersion1Canvas("https://rout.be/a89k");
    expect(check.fits).toBe(true);
    expect(check.version).toBeGreaterThan(1);
  });

  it("only warns past Version 10", () => {
    const check = checkVersion1Canvas("A".repeat(400));
    expect(check.fits).toBe(false);
    expect(check.reason).toMatch(/Version 10/);
  });
});
