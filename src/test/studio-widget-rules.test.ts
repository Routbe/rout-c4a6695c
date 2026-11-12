import { describe, expect, it } from "vitest";
import { ensureStudioWidget, isStudioWidget } from "@/lib/studio-widget-rules";

describe("standalone Studio widgets", () => {
  for (const kind of ["widget:questions", "widget:guestbook", "widget:badges"]) {
    it(`keeps ${kind} directly available and adds it only once`, () => {
      const blocks = ensureStudioWidget([], kind);
      expect(blocks.map((block) => block.kind)).toEqual([kind]);
      expect(ensureStudioWidget(blocks, kind)).toBe(blocks);
      expect(isStudioWidget(kind)).toBe(true);
    });
  }
  it("separates interactive widgets from ordinary links", () => {
    expect(isStudioWidget("newsletter")).toBe(true);
    expect(isStudioWidget("audio_player")).toBe(true);
    expect(isStudioWidget("link")).toBe(false);
    expect(isStudioWidget("instagram")).toBe(false);
  });
});