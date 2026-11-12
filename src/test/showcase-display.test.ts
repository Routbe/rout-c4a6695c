import { describe, expect, it } from "vitest";
import { showcaseDisplay } from "@/lib/showcase-display";

describe("showcase presentation preferences", () => {
  it("retains the normalized canvas used by avatar frames", () => {
    expect(showcaseDisplay({ canvasColor: "#ffffff" }).canvasColor).toBe("#ffffff");
    expect(showcaseDisplay({ canvasColor: "not-a-color" }).canvasColor).toBeNull();
  });
});