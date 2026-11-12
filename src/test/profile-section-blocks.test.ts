import { describe, expect, it } from "vitest";
import { scheduledBlocks, type ProfileBlock } from "@/lib/profile";
import { isProfileSectionKind, usesSectionFallback } from "@/lib/profile-section-blocks";
describe("positionable profile sections", () => {
  for (const kind of ["widget:questions", "widget:guestbook", "widget:badges", "widget:reach"] as const) {
    it(`${kind} uses fallback only without an explicit block`, () => {
      const block: ProfileBlock = { id: "section", kind, label: kind, value: "" };
      expect(isProfileSectionKind(kind)).toBe(true);
      expect(usesSectionFallback([], kind)).toBe(true);
      expect(usesSectionFallback([block], kind)).toBe(false);
      expect(usesSectionFallback([{ ...block, hidden: true }], kind)).toBe(false);
      expect(scheduledBlocks([{ ...block, hidden: true }], 1000)).toEqual([]);
    });
  }
  it("retains the selected order for all three sections", () => {
    const blocks = ["widget:reach", "widget:guestbook", "widget:badges"].map((kind, i) => ({ id: String(i), kind, label: kind, value: "" }));
    expect(scheduledBlocks(blocks, 1000).map((b) => b.kind)).toEqual(["widget:reach", "widget:guestbook", "widget:badges"]);
    expect(isProfileSectionKind("widget:unknown")).toBe(false);
  });
});