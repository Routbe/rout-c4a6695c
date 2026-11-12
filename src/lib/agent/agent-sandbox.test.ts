import { describe, expect, it } from "vitest";
import {
  generateClaimCode,
  generateSandboxKey,
  isSandboxKey,
  leadingZeroBits,
  normalizeClaimCode,
  parseClaimInput,
  sandboxAppsInput,
  sandboxProfileInput,
  sandboxRegisterInput,
  sha256Hex,
  signChallenge,
  verifyChallenge,
} from "./agent-sandbox";

const rnd = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const SECRET = "x".repeat(40);

describe("claim code", () => {
  it("is ROUT- plus 25 symbols in groups of 5 and validates its checksum", () => {
    const code = generateClaimCode(rnd);
    expect(code).toMatch(/^ROUT(-[0-9A-HJKMNP-TV-Z]{5}){5}$/);
    expect(normalizeClaimCode(code)).not.toBeNull();
    expect(normalizeClaimCode(code.toLowerCase().replace(/-/g, " "))).toBe(normalizeClaimCode(code));
  });
  it("rejects a single changed symbol", () => {
    const code = generateClaimCode(rnd);
    const last = code.at(-1)!;
    const swapped = code.slice(0, -1) + (last === "0" ? "1" : "0");
    expect(normalizeClaimCode(swapped)).toBeNull();
  });
  it("rejects wrong length", () => {
    expect(normalizeClaimCode("ROUT-ABCDE")).toBeNull();
  });
});

describe("claim input", () => {
  const token = "a".repeat(64);
  it("accepts a claim link, a bare token and a code", () => {
    expect(parseClaimInput(`https://rout.be/claim/workspace/${token}`)).toEqual({ kind: "token", token });
    expect(parseClaimInput(token)).toEqual({ kind: "token", token });
    expect(parseClaimInput(generateClaimCode(rnd))?.kind).toBe("code");
    expect(parseClaimInput("hello")).toBeNull();
  });
});

describe("sandbox key", () => {
  it("is rsk_ + 64 hex", () => {
    expect(isSandboxKey(generateSandboxKey(rnd))).toBe(true);
    expect(isSandboxKey("rsk_short")).toBe(false);
  });
});

describe("proof of work", () => {
  it("counts leading zero bits", () => {
    expect(leadingZeroBits("0f")).toBe(4);
    expect(leadingZeroBits("01")).toBe(7);
    expect(leadingZeroBits("80")).toBe(0);
  });
  it("accepts a real solution and rejects tampering, expiry and weak work", async () => {
    const now = 1_000_000;
    const ch = await signChallenge(SECRET, now, rnd(16), 8);
    let n = 0;
    while (leadingZeroBits(await sha256Hex(`${ch}:${n.toString(36)}`)) < 8) n++;
    const sol = n.toString(36);
    expect(await verifyChallenge(SECRET, ch, sol, now)).toEqual({ ok: true });
    expect((await verifyChallenge("y".repeat(40), ch, sol, now)).ok).toBe(false);
    expect(await verifyChallenge(SECRET, ch, sol, now + 601)).toEqual({ ok: false, reason: "expired" });
    const tampered = ch.replace(".8.", ".0.");
    expect((await verifyChallenge(SECRET, tampered, sol, now)).ok).toBe(false);
  });
});

describe("strict inputs", () => {
  it("rejects an e-mail field at registration", () => {
    expect(sandboxRegisterInput.safeParse({ challenge: "c".repeat(20), solution: "a", agent_name: "Bot", email: "a@b.c" }).success).toBe(false);
  });
  it("allows at most 3 apps and only https redirects", () => {
    const app = { name: "A", redirect_uris: ["https://x.test/cb"] };
    expect(sandboxAppsInput.safeParse({ apps: [app, app, app] }).success).toBe(true);
    expect(sandboxAppsInput.safeParse({ apps: [app, app, app, app] }).success).toBe(false);
    expect(sandboxAppsInput.safeParse({ apps: [{ name: "A", redirect_uris: ["http://evil.test/cb"] }] }).success).toBe(false);
  });
  it("blocks personal-only prefs and avatar URLs on the profile", () => {
    expect(sandboxProfileInput.safeParse({ displayPrefs: { questionsEnabled: true } }).success).toBe(false);
    expect(sandboxProfileInput.safeParse({ avatarUrl: "https://x.test/a.png" }).success).toBe(false);
    expect(sandboxProfileInput.safeParse({ theme: "noir", blocks: [{ id: "b1", kind: "link", label: "Site", value: "https://x.test" }] }).success).toBe(true);
  });
});
