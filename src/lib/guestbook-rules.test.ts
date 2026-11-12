import { describe, expect, it } from "vitest";
import { GUESTBOOK_MAX, normalizeNote } from "./guestbook-rules";

describe("guestbook notes", () => {
  it("allows up to 150 characters", () => {
    expect(GUESTBOOK_MAX).toBe(150);
    expect(normalizeNote("a".repeat(150))).toHaveLength(150);
    expect(normalizeNote("a".repeat(151))).toBeNull();
  });
  it("rejects empty notes and collapses whitespace", () => {
    expect(normalizeNote("   ")).toBeNull();
    expect(normalizeNote(" hoi \n  daar ")).toBe("hoi daar");
  });
});
