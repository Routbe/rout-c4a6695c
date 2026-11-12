import { describe, expect, it } from "vitest";
import { FRONT_WINDOW_S, frontCardUrl, frontCode, frontWindow, isFreshFrontCode } from "./card-front-code";

const key = new Uint8Array(32).fill(7);
const serial = "RC-TEST-0001";
const t0 = 1_800_000_000_000;

describe("ROUT Card front code", () => {
  it("is exactly six digits", async () => {
    expect(await frontCode(key, serial, frontWindow(t0))).toMatch(/^\d{6}$/);
  });

  it("changes every 10 minutes", async () => {
    expect(FRONT_WINDOW_S).toBe(600);
    const codes = new Set<string>();
    for (let i = 0; i < 6; i++) codes.add(await frontCode(key, serial, frontWindow(t0) + i));
    expect(codes.size).toBeGreaterThan(1);
    expect(frontWindow(t0 + 599_000)).toBe(frontWindow(t0 - (t0 % 600_000)) + Math.floor(((t0 % 600_000) + 599_000) / 600_000));
  });

  it("is fresh in the current and previous window only", async () => {
    const w = frontWindow(t0);
    const cur = await frontCode(key, serial, w);
    const prev = await frontCode(key, serial, w - 1);
    const old = await frontCode(key, serial, w - 3);
    expect(await isFreshFrontCode(key, serial, cur, t0)).toBe(true);
    expect(await isFreshFrontCode(key, serial, prev, t0)).toBe(true);
    if (old !== cur && old !== prev) expect(await isFreshFrontCode(key, serial, old, t0)).toBe(false);
  });

  it("differs per card and rejects malformed codes", async () => {
    const w = frontWindow(t0);
    const a = await Promise.all([0, 1, 2, 3].map((i) => frontCode(key, serial, w + i)));
    const b = await Promise.all([0, 1, 2, 3].map((i) => frontCode(key, "RC-OTHER-0002", w + i)));
    expect(a).not.toEqual(b);
    expect(await isFreshFrontCode(key, serial, "12a456", t0)).toBe(false);
    expect(await isFreshFrontCode(key, serial, "1234", t0)).toBe(false);
    expect(await isFreshFrontCode(key, serial, "123", t0)).toBe(false);
  });

  it("refuses short keys", async () => {
    await expect(frontCode(new Uint8Array(8), serial, 1)).rejects.toThrow();
  });

  it("builds rout.be/<handle>/<code>", () => {
    expect(frontCardUrl("https://rout.be/", "@Jona.Zeno", "004271")).toBe("https://rout.be/jona.zeno/004271");
  });
});
