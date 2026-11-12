import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

const state = vi.hoisted(() => ({ failNextInsert: false, unavailable: false, ddlCalls: 0 }));
const used = new Set<string>();
vi.mock("@/lib/neon", () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => {
    const q = strings.join("?");
    if (/create table/i.test(q)) {
      state.ddlCalls += 1;
      return Promise.reject(new Error("DDL forbidden for rout_app"));
    }
    if (q.includes("insert into public.altcha_used")) {
      if (state.unavailable) return Promise.reject(new Error("replay store unavailable"));
      if (state.failNextInsert) {
        state.failNextInsert = false;
        return Promise.reject(new Error("transient gateway blip"));
      }
      const sig = values[0] as string;
      if (used.has(sig)) return Promise.resolve([]);
      used.add(sig);
      return Promise.resolve([{ signature: sig }]);
    }
    return Promise.resolve([]);
  },
}));

process.env["ALTCHA_HMAC_KEY"] = "test-key-test-key-test-key";
const { createAltchaChallenge, verifyAltcha } = await import("@/lib/altcha.server");

function solve(ch: { challenge: string; salt: string; signature: string; maxnumber: number }) {
  for (let n = 0; n <= ch.maxnumber; n++) {
    if (createHash("sha256").update(ch.salt + n).digest("hex") === ch.challenge) {
      return Buffer.from(JSON.stringify({ algorithm: "SHA-256", challenge: ch.challenge, salt: ch.salt, signature: ch.signature, number: n })).toString("base64");
    }
  }
  throw new Error("unsolved");
}

describe("altcha", () => {
  beforeEach(() => {
    used.clear();
    state.failNextInsert = false;
    state.unavailable = false;
    state.ddlCalls = 0;
  });
  it("rejects missing or malformed proof", async () => {
    expect((await verifyAltcha(null)).ok).toBe(false);
    expect((await verifyAltcha("not-base64-json")).ok).toBe(false);
  });
  it("accepts a valid proof once, rejects replay", async () => {
    const proof = solve(await createAltchaChallenge());
    expect(await verifyAltcha(proof)).toEqual({ ok: true });
    expect(await verifyAltcha(proof)).toEqual({ ok: false, reason: "replayed" });
    expect(state.ddlCalls).toBe(0);
  });
  it("rejects expired proof", async () => {
    const proof = solve(await createAltchaChallenge());
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 10 * 60_000);
    expect((await verifyAltcha(proof)).ok).toBe(false);
    vi.useRealTimers();
  });
  it("rejects a tampered number and an easy proof when hard is required", async () => {
    const ch = await createAltchaChallenge();
    const p = JSON.parse(Buffer.from(solve(ch), "base64").toString());
    p.number = p.number + 1;
    expect((await verifyAltcha(Buffer.from(JSON.stringify(p)).toString("base64"))).ok).toBe(false);
    expect(await verifyAltcha(solve(await createAltchaChallenge()), { requireHard: true })).toEqual({ ok: false, reason: "too_easy" });
  });
  it("retries a transient replay-store failure once instead of failing the sign-in", async () => {
    const proof = solve(await createAltchaChallenge());
    state.failNextInsert = true;
    expect(await verifyAltcha(proof)).toEqual({ ok: true });
  });
  it("never accepts a proof when replay protection cannot be persisted", async () => {
    const proof = solve(await createAltchaChallenge());
    state.unavailable = true;
    expect(await verifyAltcha(proof)).toEqual({ ok: false, reason: "store_unavailable" });
    state.unavailable = false;
    expect(await verifyAltcha(proof)).toEqual({ ok: true });
    expect(await verifyAltcha(proof)).toEqual({ ok: false, reason: "replayed" });
  });
});
