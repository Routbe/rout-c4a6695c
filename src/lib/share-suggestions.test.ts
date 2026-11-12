import { describe, expect, it } from "vitest";
import { suggestMetaDescription, suggestMetaTitle, suggestOgImage } from "./share-suggestions";

describe("share suggestions", () => {
  it("builds title from name and handle", () => {
    expect(suggestMetaTitle({ handle: "@sas", displayName: "Sas" })).toBe("Sas (@sas) — ROUT");
    expect(suggestMetaTitle({ handle: "sas", displayName: " " })).toBe("@sas (@sas) — ROUT");
  });
  it("falls back to fixed description without bio", () => {
    expect(suggestMetaDescription({ handle: "sas", displayName: "Sas", bio: "" })).toBe(
      "Bekijk het geverifieerde profiel van Sas op ROUT.",
    );
  });
  it("prefers avatar, then the OG card", () => {
    expect(suggestOgImage({ handle: "sas", displayName: "", avatarUrl: "https://x/a.jpg" })).toBe("https://x/a.jpg");
    expect(suggestOgImage({ handle: "sas", displayName: "" })).toBe("/api/public/og/sas.png");
  });
});
