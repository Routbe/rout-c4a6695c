import { describe, expect, it } from "vitest";
import {
  BASE36_COLLISION_RETRIES,
  SLUG_ALLOCATION_ATTEMPTS,
  base36Capacity,
  baseSlugLengthForUsage,
  slugLengthForAttempt,
  fitsVersion1,
  isBase36Slug,
  looksLikeBase36Slug,
  qrPayloadForSlug,
  randomBase36Slug,
  toBase36,
} from "./base36";

describe("base36 slugs", () => {
  it("generates 4-char uppercase codes with at least one digit", () => {
    for (let i = 0; i < 200; i += 1) {
      const slug = randomBase36Slug();
      expect(slug).toHaveLength(4);
      expect(isBase36Slug(slug)).toBe(true);
      expect(/[0-9]/.test(slug)).toBe(true);
    }
  });

  it("normalises messy input", () => {
    expect(toBase36(" a8-9k! ")).toBe("A89K");
  });

  it("only treats 4-char codes with a digit as root short links", () => {
    expect(looksLikeBase36Slug("A89K")).toBe(true);
    expect(looksLikeBase36Slug("a89k")).toBe(true);
    expect(looksLikeBase36Slug("jona")).toBe(false);
    expect(looksLikeBase36Slug("a89kk")).toBe(false);
  });

  it("keeps the QR payload inside a Version 1 code", () => {
    const payload = qrPayloadForSlug("a89k");
    expect(payload).toBe("HTTPS://ROUT.BE/A89K");
    expect(payload.length).toBeLessThanOrEqual(20);
    expect(fitsVersion1(payload)).toBe(true);
  });

  it("rejects lowercase payloads for Version 1", () => {
    expect(fitsVersion1("https://rout.be/a89k")).toBe(false);
  });
});

describe("capacity scaling", () => {
  it("keeps the base length while the namespace is quiet", () => {
    expect(baseSlugLengthForUsage(0)).toBe(4);
    expect(baseSlugLengthForUsage(1_000)).toBe(4);
  });

  it("adds a character once 80% of the namespace is used", () => {
    const full = base36Capacity(4);
    expect(baseSlugLengthForUsage(Math.floor(full * 0.81))).toBe(5);
  });

  it("scales to the 6-char maximum when 5 chars also saturate", () => {
    expect(baseSlugLengthForUsage(Math.floor(base36Capacity(5) * 0.9))).toBe(6);
    expect(baseSlugLengthForUsage(base36Capacity(6) * 2)).toBe(6);
  });

  it("retries at the base length before growing the slug", () => {
    for (let attempt = 0; attempt <= BASE36_COLLISION_RETRIES; attempt += 1) {
      expect(slugLengthForAttempt(attempt)).toBe(4);
    }
    expect(slugLengthForAttempt(BASE36_COLLISION_RETRIES + 1)).toBe(5);
    expect(slugLengthForAttempt(BASE36_COLLISION_RETRIES + 3)).toBe(6);
    expect(slugLengthForAttempt(SLUG_ALLOCATION_ATTEMPTS)).toBe(6);
  });

  it("generates valid codes at every scaled length", () => {
    for (const length of [4, 5, 6]) {
      const slug = randomBase36Slug(length);
      expect(slug).toHaveLength(length);
      expect(isBase36Slug(slug)).toBe(true);
      expect(/[0-9]/.test(slug)).toBe(true);
    }
  });
});
