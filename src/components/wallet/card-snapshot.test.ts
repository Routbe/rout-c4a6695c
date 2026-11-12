import { describe, expect, it, vi } from "vitest";
import { captureCardSnapshot } from "./card-snapshot";

describe("card snapshot buffer lifecycle", () => {
  it("renders at 3x immediately before capture and restores the original pixel ratio", () => {
    const order: string[] = [];
    const renderer = { getPixelRatio: () => 1.5, setPixelRatio: (n: number) => order.push(`ratio:${n}`), render: () => order.push("render"), domElement: { toDataURL: (type: string) => { order.push(type); return "data:image/png;base64,real"; } } };
    expect(captureCardSnapshot(renderer, {}, {})).toBe("data:image/png;base64,real");
    expect(order).toEqual(["ratio:3", "render", "image/png", "ratio:1.5", "render"]);
  });
  it("restores state even when a tainted canvas refuses export", () => {
    const setPixelRatio = vi.fn();
    const renderer = { getPixelRatio: () => 2, setPixelRatio, render: vi.fn(), domElement: { toDataURL: () => { throw new Error("tainted"); } } };
    expect(() => captureCardSnapshot(renderer, {}, {})).toThrow("tainted");
    expect(setPixelRatio).toHaveBeenLastCalledWith(2);
  });
});