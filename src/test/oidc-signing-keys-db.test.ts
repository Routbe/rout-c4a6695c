// @vitest-environment node
/** Sealed-key lifecycle against a real Postgres (PGlite) with the 0112 schema. */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

const db = new PGlite();
vi.mock("@/lib/neon", () => ({
  sql: async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ""), "");
    return (await db.query(text, values)).rows;
  },
}));
vi.stubEnv("ROUT_PROVIDER_SIGNING_KEK", "test-kek-".padEnd(48, "x"));

const keys = await import("@/lib/oauth/keys.server");

async function rows() {
  return (
    await db.query<{ kid: string; retired_at: string | null; private_jwk: unknown; private_jwk_sealed: string | null }>(
      "select kid, retired_at, private_jwk, private_jwk_sealed from public.oauth_signing_keys order by created_at",
    )
  ).rows;
}

beforeAll(async () => {
  await db.exec(`create table public.oauth_signing_keys (
    kid text primary key, private_jwk jsonb not null, public_jwk jsonb not null,
    created_at timestamptz not null default now(), retired_at timestamptz)`);
  await db.exec(readFileSync(join(__dirname, "..", "..", "db", "0112_oauth_signing_keys_sealed.sql"), "utf8"));
  // A legacy plaintext key, as written by the old code.
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const priv = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const pub = await crypto.subtle.exportKey("jwk", pair.publicKey);
  await db.query("insert into public.oauth_signing_keys (kid, private_jwk, public_jwk, created_at) values ($1, $2, $3, now() - interval '1 day')", [
    "legacy",
    JSON.stringify(priv),
    JSON.stringify({ ...pub, kid: "legacy" }),
  ]);
}, 60_000); // PGlite start-up is slow when the whole suite runs in parallel.

describe("signing keys in the database", () => {
  it("keeps signing with a legacy key until it is sealed explicitly", async () => {
    const k = await keys.activeKey(new Date());
    expect(k.kid).toBe("legacy");
    expect((await rows()).length).toBe(1);
  });

  it("sealing replaces the legacy key, wipes its plaintext and keeps it in the JWKS", async () => {
    const result = await keys.sealLegacyKeys();
    expect(result).toEqual({ rotated: true, wiped: 1 });
    const [legacy, sealed] = await rows();
    expect(legacy!.private_jwk).toBeNull();
    expect(legacy!.retired_at).not.toBeNull();
    expect(sealed!.private_jwk).toBeNull();
    expect(sealed!.private_jwk_sealed).toBeTruthy();
    expect(JSON.stringify(sealed)).not.toMatch(/"d"\s*:/);
    const jwks = await keys.publicJwks();
    expect(jwks.keys.map((k) => k.kid).sort()).toEqual([sealed!.kid, "legacy"].sort());
    expect(jwks.keys.every((k) => !("d" in k))).toBe(true);
  });

  it("signs with the sealed key and verifies only through its exact kid", async () => {
    const k = await keys.activeKey(new Date(Date.now() + 10 * 60 * 1000));
    const data = new TextEncoder().encode("probe");
    const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, k.privateKey, data);
    const pub = await keys.verificationKey({ alg: "ES256", kid: k.kid });
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub!, sig, data)).toBe(true);
    expect(await keys.verificationKey({ alg: "ES256", kid: "nope" })).toBeNull();
  });

  it("rotates automatically after 90 days", async () => {
    const before = (await rows()).at(-1)!.kid;
    const later = new Date(Date.now() + 91 * 24 * 60 * 60 * 1000);
    const k = await keys.activeKey(later);
    expect(k.kid).not.toBe(before);
    const all = await rows();
    expect(all.find((r) => r.kid === before)!.retired_at).not.toBeNull();
  });
});
