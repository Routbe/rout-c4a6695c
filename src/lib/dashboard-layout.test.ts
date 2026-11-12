import { describe, expect, it } from "vitest";
import { heightStep, moveDashboardWidgetTo, normalizeDashboardLayout, widthStep } from "./dashboard-layout";

describe("command center drag & resize", () => {
  it("drops a lifted widget at the target position", () => {
    const l = normalizeDashboardLayout({ order: ["share", "card", "presence"] });
    expect(moveDashboardWidgetTo(l, "share", "presence").order.slice(0, 3)).toEqual(["card", "presence", "share"]);
    expect(moveDashboardWidgetTo(l, "presence", "share").order.slice(0, 3)).toEqual(["presence", "share", "card"]);
  });
  it("snaps dragged sizes to columns and height steps", () => {
    expect(widthStep(600, 300, 16, 3)).toBe(2);
    expect(widthStep(2000, 300, 16, 2)).toBe(2);
    expect(heightStep(200)).toBe("auto");
    expect(heightStep(500)).toBe("xl");
  });
});
