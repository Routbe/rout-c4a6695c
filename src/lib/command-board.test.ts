import { describe, expect, it } from "vitest";
import { addItem, moveItem, normalizeLayout, resizeItem } from "./command-board";

const known = ["a", "b", "c"];

describe("command board layout", () => {
  it("clamps widths between 1 and 4 columns", () => {
    const l = normalizeLayout({ items: [{ id: "a", w: 9, h: "m" }, { id: "b", w: 0, h: "x" }] }, known);
    expect(l.items).toEqual([{ id: "a", w: 4, h: "m" }, { id: "b", w: 1, h: "auto" }]);
  });
  it("drops unknown and duplicate widgets", () => {
    expect(normalizeLayout({ items: [{ id: "a", w: 1 }, { id: "a", w: 2 }, { id: "zz", w: 1 }] }, known).items.map((i) => i.id)).toEqual(["a"]);
  });
  it("moves a widget to a new position", () => {
    const l = normalizeLayout({ items: [{ id: "a", w: 1 }, { id: "b", w: 1 }, { id: "c", w: 1 }] }, known);
    expect(moveItem(l, "c", 0).items.map((i) => i.id)).toEqual(["c", "a", "b"]);
  });
  it("resizes without exceeding the grid and adds each widget once", () => {
    const l = normalizeLayout({ items: [{ id: "a", w: 4 }] }, known);
    expect(resizeItem(l, "a", { w: 5 as 4 }).items[0]!.w).toBe(4);
    expect(addItem(addItem(l, "b", known), "b", known).items).toHaveLength(2);
  });
});
