import { expect, it } from "vitest";
import { profileSurface } from "./profile-surface";
import { contrastRatio } from "./wcag";
const theme = { bg: "#0D0D0D", card: "#171717", text: "#F5F5F5", muted: "#A3A3A3", border: "#2A2A2A" };
it("keeps the preset when no custom background is selected", () => expect(profileSurface(theme)).toBe(theme));
it("adapts message and frame surfaces when the canvas changes", () => {
  const result = profileSurface(theme, "#FFFFFF");
  expect(result.bg).toBe("#FFFFFF");
  expect(result.card).not.toBe(theme.card);
  expect(result.border).not.toBe(theme.border);
  expect(contrastRatio(result.text, result.card)).toBeGreaterThan(4.5);
});