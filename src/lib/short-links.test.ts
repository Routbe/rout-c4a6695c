import { describe, expect, it } from "vitest";
import { mergeKind, normalizeSlug, shortLinkUrl, validateSlug } from "./short-links";

describe("normalizeSlug", () => {
  it("lowercases, collapses spaces and strips junk", () => {
    expect(normalizeSlug("  Zomer  Campagne!! ")).toBe("zomer-campagne");
  });

  it("collapses repeated dashes and trims edges", () => {
    expect(normalizeSlug("--a---b--")).toBe("a-b");
  });

  it("caps the length at 32 characters", () => {
    expect(normalizeSlug("x".repeat(50))).toHaveLength(32);
  });
});

describe("validateSlug", () => {
  it("accepts a normal slug", () => {
    expect(validateSlug("Zomer 2026")).toEqual({ slug: "zomer-2026", error: null });
  });

  it("rejects empty input", () => {
    expect(validateSlug("   ").slug).toBeNull();
  });

  it("rejects a single character", () => {
    expect(validateSlug("a").slug).toBeNull();
  });

  it("rejects reserved app paths so a branded domain keeps working", () => {
    for (const reserved of ["admin", "auth", "dashboard", "s"]) {
      expect(validateSlug(reserved).slug).toBeNull();
    }
  });
});

describe("shortLinkUrl", () => {
  it("uses a branded domain when short links are enabled for it", () => {
    expect(shortLinkUrl("abc123", "bxl.li", true)).toBe("https://bxl.li/s/abc123");
  });

  it("falls back to the app origin when the domain toggle is off", () => {
    expect(shortLinkUrl("abc123", "bxl.li", false)).toBe(`${window.location.origin}/s/abc123`);
  });

  it("falls back when no domain is set", () => {
    expect(shortLinkUrl("abc123", null)).toBe(`${window.location.origin}/s/abc123`);
  });
});

describe("mergeKind", () => {
  it("keeps the kind when it does not change", () => {
    expect(mergeKind("qr", "qr")).toBe("qr");
  });

  it("promotes a QR that gets a short link to both", () => {
    expect(mergeKind("qr", "link")).toBe("both");
  });

  it("treats a missing kind as the added kind", () => {
    expect(mergeKind(null, "link")).toBe("link");
  });
});
