import { describe, expect, it } from "vitest";
import { VisitWorld } from "./physics-core";
const base = { type: "init" as const, width: 360, height: 640, floor: 640, amount: 1, textures: 1, direction: "down" as const,
  fade: false, rampInMs: 0, rampOutMs: 0, totalMs: 5000, bodies: [] as [number, number, number, number][] };
const run = (w: VisitWorld, n: number) => { let a = 0; for (let i = 0; i < n; i++) a = w.step(16); return a; };
describe("visit physics", () => {
  it("through: removed below screen", () => { const w = new VisitWorld({ ...base, floorMode: "through" }); expect(run(w, 400)).toBe(0); });
  it("lands on a DOM body (button)", () => {
    const w = new VisitWorld({ ...base, floorMode: "vanish", bodies: [[-10, 300, 380, 50]] });
    w.ps.length = 0; run(w, 1); const p = w.ps[0]; p.x = p.px = 180; run(w, 60);
    expect(p.y).toBeLessThan(300);
  });
  it("bounce reverses with damping", () => {
    const w = new VisitWorld({ ...base, floorMode: "bounce" }); run(w, 1); const p = w.ps[0];
    let minAfter = Infinity, hit = false;
    for (let i = 0; i < 200; i++) { w.step(16); if (p.y + p.r >= 639) hit = true; else if (hit) minAfter = Math.min(minAfter, p.y); }
    expect(hit).toBe(true); expect(minAfter).toBeLessThan(630);
  });
  it("splat sets squash from impact and fades in 300ms", () => {
    const w = new VisitWorld({ ...base, floorMode: "splat" }); run(w, 1); const p = w.ps[0];
    while (!p.resting) w.step(16);
    expect(p.squash).toBeGreaterThan(0.4); run(w, 20); expect(p.dead).toBe(true);
  });
});
describe("absolute world camera", () => {
  it("lands on the page floor, not the viewport, and ignores scroll", () => {
    const w = new VisitWorld({ ...base, floorMode: "splat", cameraY: 500, floor: 2000, pageHeight: 2000 });
    run(w, 1); const p = w.ps[0]; expect(p.y).toBeLessThan(500);
    while (!p.resting) w.step(16);
    expect(Math.round(p.y + p.r)).toBe(2000);
  });
});
