import { afterEach, describe, expect, it, vi } from "vitest";
import { SEND_FLOOR_MS, abuseEpoch, constantTime, fuzzyArrival, paddedDuration } from "./privacy-keys";
import { abuseKeys, muterNetKey, rateLimitKey, senderBaseKeys } from "./privacy-keys.server";
import { needsCrisisHelp } from "./crisis";

function fakeClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    sleep: async (ms: number) => { t += ms; },
    advance: (ms: number) => { t += ms; },
  };
}

describe("constant-time send", () => {
  it("a delivered and a voided send take exactly the same time", async () => {
    const a = fakeClock();
    await constantTime(async () => { a.advance(310); return "ok"; }, "x", a); // real insert
    const b = fakeClock();
    await constantTime(async () => { b.advance(40); return "ok"; }, "x", b); // muted: quicker path
    expect(a.now()).toBe(SEND_FLOOR_MS);
    expect(b.now()).toBe(SEND_FLOOR_MS);
  });
  it("errors are padded too and return the fallback", async () => {
    const c = fakeClock();
    const out = await constantTime(async () => { c.advance(5); throw new Error("db"); }, "unavailable", c);
    expect(out).toBe("unavailable");
    expect(c.now()).toBe(SEND_FLOOR_MS);
  });
  it("slow sends are rounded up to the next 400 ms step", () => {
    expect(paddedDuration(1201)).toBe(1600);
    expect(paddedDuration(1600)).toBe(1600);
  });
});

describe("fuzzy arrival", () => {
  const now = new Date(2026, 10, 3, 15, 30);
  it("never shows a clock time", () => {
    expect(fuzzyArrival(new Date(2026, 10, 3, 14, 0), now).key).toBe("justNow");
    expect(fuzzyArrival(new Date(2026, 10, 3, 9, 0), now).key).toBe("thisMorning");
    expect(fuzzyArrival(new Date(2026, 10, 2, 21, 0), now).key).toBe("yesterdayEvening");
    expect(fuzzyArrival(new Date(2026, 9, 30, 10, 0), now).key).toBe("fewDays");
  });
});

describe("keyed hashing", () => {
  const prev = process.env["QA_HMAC_SECRET"];
  afterEach(() => { process.env["QA_HMAC_SECRET"] = prev; });

  it("device and account keys differ, and never equal a plain hash of the input", async () => {
    process.env["QA_HMAC_SECRET"] = "k".repeat(64);
    const k = await senderBaseKeys("device-secret-abc", "user-1");
    expect(k.device).toMatch(/^[0-9a-f]{64}$/);
    expect(k.device).not.toBe(k.account);
    const plain = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("device:device-secret-abc")))]
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(k.device).not.toBe(plain);
  });

  it("a different server secret gives unrelated keys", async () => {
    process.env["QA_HMAC_SECRET"] = "a".repeat(64);
    const one = await senderBaseKeys("dev", null);
    process.env["QA_HMAC_SECRET"] = "b".repeat(64);
    const two = await senderBaseKeys("dev", null);
    expect(one.device).not.toBe(two.device);
  });

  it("abuse keys rotate every 30 days and keep the previous epoch for bans", async () => {
    process.env["QA_HMAC_SECRET"] = "k".repeat(64);
    const day = 86_400_000;
    const t0 = 30 * day * 700;
    const a = await abuseKeys("dev", null, t0);
    const b = await abuseKeys("dev", null, t0 + 30 * day);
    expect(abuseEpoch(t0 + 30 * day)).toBe(abuseEpoch(t0) + 1);
    expect(b.now).not.toBe(a.now);
    expect(b.prev).toBe(a.now);
  });

  it("rate-limit and muter-network keys rotate daily and are purpose-separated", async () => {
    process.env["QA_HMAC_SECRET"] = "k".repeat(64);
    const day = 86_400_000;
    const r1 = await rateLimitKey("question-ask", "203.0.113.7", 1000 * day);
    const r2 = await rateLimitKey("question-ask", "203.0.113.7", 1001 * day);
    const other = await rateLimitKey("rewrite", "203.0.113.7", 1000 * day);
    const net = await muterNetKey("203.0.113.7", 1000 * day);
    expect(r1).not.toBe(r2);
    expect(r1).not.toBe(other);
    expect(net).not.toBe(r1);
  });

  it("without the secret the Q&A keys refuse instead of falling back", async () => {
    vi.stubEnv("QA_HMAC_SECRET", "");
    await expect(senderBaseKeys("dev", null)).rejects.toThrow();
    vi.unstubAllEnvs();
  });
});

describe("crisis help", () => {
  it("offers help numbers for self-harm phrases in nl, fr, en and de", () => {
    expect(needsCrisisHelp("ik wil niet meer leven")).toBe(true);
    expect(needsCrisisHelp("j'ai envie de mourir")).toBe(true);
    expect(needsCrisisHelp("i want to die")).toBe(true);
    expect(needsCrisisHelp("ich will sterben")).toBe(true);
    expect(needsCrisisHelp("wat is je lievelingsfilm?")).toBe(false);
  });
});
