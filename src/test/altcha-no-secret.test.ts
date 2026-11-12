import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/neon", () => ({ sql: async () => [{ signature: "x" }] }));
vi.mock("@/lib/better-auth.server", () => ({ resolveAuthSecret: () => null }));

describe("ALTCHA without any server secret", () => {
  it("refuses to sign challenges and rejects every proof instead of using a source constant", async () => {
    vi.stubEnv("ALTCHA_HMAC_KEY", "");
    vi.stubEnv("DATABASE_URL", "");
    const { createAltchaChallenge, verifyAltcha } = await import("@/lib/altcha.server");
    await expect(createAltchaChallenge()).rejects.toThrow("altcha_not_configured");
    const { createHash, createHmac } = await import("node:crypto");
    // A proof forged with the old public fallback must not pass.
    const salt = `abc?expires=${Math.floor(Date.now() / 1000) + 60}&d=n`;
    const challenge = createHash("sha256").update(salt + 7).digest("hex");
    const key = createHash("sha256").update("rout-altcha:rout-altcha-unconfigured").digest("hex");
    const signature = createHmac("sha256", key).update(challenge).digest("hex");
    const payload = Buffer.from(JSON.stringify({ algorithm: "SHA-256", challenge, number: 7, salt, signature })).toString("base64");
    expect(await verifyAltcha(payload)).toEqual({ ok: false, reason: "not_configured" });
    vi.unstubAllEnvs();
  });
});
