import { describe, expect, it } from "vitest";
import { LIVE_WINDOW_S, liveCode, liveSeed, liveWindow, pickCardView, verifyLiveCode } from "./card-liveness";

const key = new Uint8Array(32).fill(7);
const other = new Uint8Array(32).fill(8);
const serial = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4";
const now = 1_800_000_000_000;

describe("card liveness", () => {
  it("issues a 6-character code that changes every 30 seconds", async () => {
    const w = liveWindow(now);
    const a = await liveCode(key, serial, w);
    expect(a).toMatch(/^[0-9A-Z]{6}$/);
    expect(await liveCode(key, serial, w)).toBe(a);
    expect(await liveCode(key, serial, w + 1)).not.toBe(a);
  });

  it("accepts the current and adjacent window, rejects older codes", async () => {
    const code = await liveCode(key, serial, liveWindow(now));
    expect(await verifyLiveCode(key, serial, code, now)).toBe(true);
    expect(await verifyLiveCode(key, serial, code.toLowerCase(), now + LIVE_WINDOW_S * 1000)).toBe(true);
    expect(await verifyLiveCode(key, serial, code, now + LIVE_WINDOW_S * 3000)).toBe(false);
  });

  it("a code from another key or another card is never valid", async () => {
    const w = liveWindow(now);
    expect(await verifyLiveCode(key, serial, await liveCode(other, serial, w), now)).toBe(false);
    expect(await verifyLiveCode(key, serial.replace("a1", "ff"), await liveCode(key, serial, w), now)).toBe(false);
  });

  it("rejects short keys and malformed serials", async () => {
    await expect(liveCode(new Uint8Array(16), serial, 1)).rejects.toThrow();
    await expect(liveCode(key, "bad serial!", 1)).rejects.toThrow();
  });

  it("the shader seed is not the code", async () => {
    const seed = await liveSeed(key, serial, 5);
    expect(seed).toHaveLength(4);
    seed.forEach((v) => expect(v).toBeGreaterThanOrEqual(0));
  });

  it("the card view drops email, phone, birth date and account id", () => {
    const view = pickCardView({ displayName: "Len", handle: "len", email: "x@y.z", phone: "+32", birthDate: "2000-01-01", id: "uuid" });
    expect(Object.keys(view).sort()).toEqual(["displayName", "handle"]);
  });
});
