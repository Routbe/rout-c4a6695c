import { expect, it } from "vitest";
import { isProfileSectionKind, usesSectionFallback } from "./profile-section-blocks";

it("keeps the anonymous inbox as a movable section without resurrecting a hidden copy", () => {
  expect(isProfileSectionKind("widget:questions")).toBe(true);
  expect(usesSectionFallback([{ id: "q", kind: "widget:questions", label: "", value: "", hidden: true }], "widget:questions")).toBe(false);
});