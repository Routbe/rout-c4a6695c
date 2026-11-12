import { expect, it } from "vitest";
import { profilePreviewPath } from "./profile-preview";
import { profileSocialMeta } from "./social-meta";
it("separates same-named root and alias share images", () => {
  expect(profilePreviewPath("anna")).toBe("/api/public/og/anna.png");
  expect(profilePreviewPath("anna", "alias")).toBe("/api/public/og/anna.png?space=alias");
});
it("alias social metadata requests the alias namespace", () => {
  const meta = profileSocialMeta({ handle: "anna", locale: "nl", space: "alias" });
  expect(meta.find(m => "property" in m && m.property === "og:image")?.content).toBe("https://rout.be/api/public/og/anna.png?space=alias");
});