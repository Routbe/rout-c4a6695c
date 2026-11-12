import { describe, expect, it } from "vitest";
import { normalizeBadgeWebsite } from "../lib/badge-editor-rules";
describe("badge website input", () => {
  it("accepts a family website without typing https", () => expect(normalizeBadgeWebsite("familie.be")).toBe("https://familie.be/"));
  it("keeps an existing HTTPS link", () => expect(normalizeBadgeWebsite("https://familie.be/history")).toBe("https://familie.be/history"));
  it("rejects active content links", () => expect(() => normalizeBadgeWebsite("javascript:alert(1)")).toThrow());
  it("rejects embedded credentials", () => expect(() => normalizeBadgeWebsite("https://someone:secret@familie.be")).toThrow());
});