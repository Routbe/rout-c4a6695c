import { describe, expect, it } from "vitest";
import { FOOTER_STYLES, footerBlockStyle } from "@/lib/profile-design";

describe("footerstijlen", () => {
  it("biedt 50 unieke stijlen", () => {
    expect(new Set(FOOTER_STYLES.map((s) => s.id)).size).toBe(50);
  });
  it("geeft elke extra stijl echte CSS", () => {
    const theme = { border: "#ccc", card: "#fff", muted: "#666" };
    for (const s of FOOTER_STYLES.filter((x) => x.id !== "plain")) {
      expect(Object.keys(footerBlockStyle(s.id, "#f00", theme)).length).toBeGreaterThan(0);
    }
  });
});
