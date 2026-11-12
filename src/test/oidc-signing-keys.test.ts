// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KEY_MAX_AGE_MS,
  RETIRED_KEY_GRACE_MS,
  activeSigningKey,
  privatePartsToWipe,
  publishedKeys,
  rotationReason,
  verificationKidFor,
  type SigningKeyMeta,
} from "@/lib/oauth/key-rules";
import { currentKek, kekFingerprint, openPrivateJwk, sealPrivateJwk, type Kek } from "@/lib/oauth/key-seal.server";

const now = new Date("2026-10-30T06:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const DAY = 24 * 60 * 60 * 1000;
const key = (over: Partial<SigningKeyMeta>): SigningKeyMeta => ({
  kid: "k1",
  createdAt: ago(DAY),
  retiredAt: null,
  revokedAt: null,
  storage: "sealed",
  kekFingerprint: "fp",
  ...over,
});

describe("signing key rotation", () => {
  it("rotates when no key exists", () => {
    expect(rotationReason(null, "fp", now)).toBe("missing");
  });

  it("rotates a sealed key after 90 days, not before", () => {
    expect(KEY_MAX_AGE_MS).toBe(90 * DAY);
    expect(rotationReason(key({ createdAt: ago(89 * DAY) }), "fp", now)).toBeNull();
    expect(rotationReason(key({ createdAt: ago(90 * DAY) }), "fp", now)).toBe("expired");
  });

  it("rotates when the key-encryption key changed and the key is at least an hour old", () => {
    expect(rotationReason(key({ kekFingerprint: "old", createdAt: ago(60 * 60 * 1000) }), "fp", now)).toBe("kek_changed");
  });

  it("refuses to replace a key sealed under another KEK within the hour (two deployments, two KEKs)", () => {
    expect(rotationReason(key({ kekFingerprint: "other", createdAt: ago(59 * 60 * 1000) }), "fp", now)).toBe("kek_conflict");
  });

  it("never auto-rotates a legacy plaintext key (sealing is an explicit step)", () => {
    expect(rotationReason(key({ storage: "legacy_plaintext", createdAt: ago(400 * DAY), kekFingerprint: null }), "fp", now)).toBeNull();
  });

  it("signs with the newest key that is neither retired nor revoked", () => {
    const keys = [
      key({ kid: "old", createdAt: ago(10 * DAY) }),
      key({ kid: "new", createdAt: ago(1 * DAY) }),
      key({ kid: "retired", createdAt: ago(0), retiredAt: ago(0) }),
    ];
    expect(activeSigningKey(keys)?.kid).toBe("new");
  });
});

describe("JWKS publication", () => {
  it("keeps a retired key published for 48 hours, then drops it", () => {
    expect(RETIRED_KEY_GRACE_MS).toBe(48 * 60 * 60 * 1000);
    const keys = [
      key({ kid: "fresh", retiredAt: ago(47 * 60 * 60 * 1000) }),
      key({ kid: "stale", retiredAt: ago(48 * 60 * 60 * 1000) }),
      key({ kid: "revoked", revokedAt: ago(1000) }),
      key({ kid: "active" }),
    ];
    expect(publishedKeys(keys, now).map((k) => k.kid)).toEqual(["fresh", "active"]);
  });

  it("wipes private parts of keys past the grace period and of revoked keys", () => {
    const keys = [
      key({ kid: "fresh", retiredAt: ago(1000) }),
      key({ kid: "stale", retiredAt: ago(3 * DAY) }),
      key({ kid: "revoked", revokedAt: ago(1000) }),
      key({ kid: "wiped", retiredAt: ago(3 * DAY), storage: "none" }),
    ];
    expect(privatePartsToWipe(keys, now)).toEqual(["stale", "revoked"]);
  });
});

describe("token header checks (F9)", () => {
  const keys = [key({ kid: "known" })];

  it("accepts only an exact, published kid with ES256", () => {
    expect(verificationKidFor({ alg: "ES256", kid: "known" }, keys, now)).toBe("known");
  });

  it("rejects an unknown kid instead of falling back to another key", () => {
    expect(verificationKidFor({ alg: "ES256", kid: "unknown" }, keys, now)).toBeNull();
  });

  it("rejects a missing kid", () => {
    expect(verificationKidFor({ alg: "ES256" }, keys, now)).toBeNull();
  });

  it("rejects any other algorithm, including none and HS256", () => {
    expect(verificationKidFor({ alg: "none", kid: "known" }, keys, now)).toBeNull();
    expect(verificationKidFor({ alg: "HS256", kid: "known" }, keys, now)).toBeNull();
  });

  it("rejects a kid that was retired beyond the grace period", () => {
    expect(verificationKidFor({ alg: "ES256", kid: "known" }, [key({ kid: "known", retiredAt: ago(3 * DAY) })], now)).toBeNull();
  });
});

describe("sealed private keys (F8)", () => {
  const kek: Kek = { material: "k".repeat(48), source: "env" };
  const jwk: JsonWebKey = { kty: "EC", crv: "P-256", x: "x", y: "y", d: "secret-d" };

  afterEach(() => vi.unstubAllEnvs());

  it("round-trips and never stores the private scalar in clear", async () => {
    const sealed = await sealPrivateJwk("kid-a", jwk, kek);
    expect(sealed.sealed).not.toContain("secret-d");
    expect(await openPrivateJwk("kid-a", sealed.sealed, sealed.iv, kek)).toEqual(jwk);
  });

  it("fails when a sealed blob is moved to another kid", async () => {
    const sealed = await sealPrivateJwk("kid-a", jwk, kek);
    await expect(openPrivateJwk("kid-b", sealed.sealed, sealed.iv, kek)).rejects.toThrow();
  });

  it("fails with a different KEK", async () => {
    const sealed = await sealPrivateJwk("kid-a", jwk, kek);
    await expect(openPrivateJwk("kid-a", sealed.sealed, sealed.iv, { material: "z".repeat(48), source: "env" })).rejects.toThrow();
  });

  it("uses a fresh IV per seal", async () => {
    const a = await sealPrivateJwk("kid-a", jwk, kek);
    const b = await sealPrivateJwk("kid-a", jwk, kek);
    expect(a.iv).not.toBe(b.iv);
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("reads ROUT_PROVIDER_SIGNING_KEK from process.env when it has at least 32 characters", async () => {
    vi.stubEnv("ROUT_PROVIDER_SIGNING_KEK", "a".repeat(32));
    const k = await currentKek();
    expect(k.source).toBe("env");
    expect(await kekFingerprint(k)).not.toBe(await kekFingerprint({ material: "b".repeat(32), source: "env" }));
  });
});
