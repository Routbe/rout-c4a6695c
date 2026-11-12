import { describe, expect, it } from "vitest";
import { safeRedirect, trustedOrigin } from "./safe-redirect";

describe("safeRedirect", () => {
  it("keeps relative paths", () => expect(safeRedirect("/settings?x=1")).toBe("/settings?x=1"));
  it("allows rout.be and rout.dlp.li", () => {
    expect(safeRedirect("https://rout.be/a")).toBe("https://rout.be/a");
    expect(safeRedirect("https://rout.dlp.li/b")).toBe("https://rout.dlp.li/b");
  });
  it("falls back to / for external or tricky urls", () => {
    for (const u of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "https://rout.be.evil.com", ""]) {
      expect(safeRedirect(u)).toBe("/");
    }
  });
  it("trustedOrigin rejects foreign origins", () => {
    expect(trustedOrigin("https://evil.com")).toBeNull();
    expect(trustedOrigin("https://rout.be/x")).toBe("https://rout.be");
  });
});
