/**
 * Signing keys for "Login met ROUT" (ES256): sealed storage, automatic
 * rotation, JWKS and strict verification-key lookup. Rules live in key-rules.ts.
 */
import { sql } from "@/lib/neon";
import {
  RETIRED_KEY_GRACE_MS,
  SIGNING_ALG,
  activeSigningKey,
  privatePartsToWipe,
  publishedKeys,
  rotationReason,
  verificationKidFor,
  type JwtHeader,
  type KeyStorage,
  type SigningKeyMeta,
} from "./key-rules";
import { currentKek, kekFingerprint, openPrivateJwk, sealPrivateJwk } from "./key-seal.server";

export type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };

type KeyRow = {
  kid: string;
  created_at: string | Date;
  retired_at: string | Date | null;
  revoked_at: string | Date | null;
  public_jwk: Jwk;
  private_jwk: Jwk | null;
  private_jwk_sealed: string | null;
  private_jwk_iv: string | null;
  kek_fingerprint: string | null;
};

type LoadedKey = SigningKeyMeta & { row: KeyRow };

const toDate = (v: string | Date | null): Date | null => (v === null ? null : new Date(v));

function storageOf(row: KeyRow): KeyStorage {
  if (row.private_jwk_sealed && row.private_jwk_iv) return "sealed";
  if (row.private_jwk && typeof row.private_jwk === "object" && "d" in row.private_jwk) return "legacy_plaintext";
  return "none";
}

async function loadKeys(): Promise<LoadedKey[]> {
  const rows = (await sql`
    select kid, created_at, retired_at, revoked_at, public_jwk, private_jwk,
           private_jwk_sealed, private_jwk_iv, kek_fingerprint
      from public.oauth_signing_keys
     order by created_at desc
  `) as KeyRow[];
  return rows.map((row) => ({
    kid: row.kid,
    createdAt: new Date(row.created_at),
    retiredAt: toDate(row.retired_at),
    revokedAt: toDate(row.revoked_at),
    storage: storageOf(row),
    kekFingerprint: row.kek_fingerprint,
    row,
  }));
}

function randomKid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Generates a new sealed key, makes it active and retires every older key. */
export async function rotateSigningKey(reason: string): Promise<string> {
  const kek = await currentKek();
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const kid = randomKid();
  const privateJwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as Jwk;
  const publicJwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as Jwk;
  const publicWithMeta: Jwk = { kty: publicJwk.kty, crv: publicJwk.crv, x: publicJwk.x, y: publicJwk.y, kid, alg: SIGNING_ALG, use: "sig" };
  const sealed = await sealPrivateJwk(kid, { ...privateJwk, kid }, kek);
  const inserted = (await sql`
    insert into public.oauth_signing_keys
      (kid, private_jwk, public_jwk, private_jwk_sealed, private_jwk_iv, kek_fingerprint, alg)
    values (${kid}, null, ${JSON.stringify(publicWithMeta)}, ${sealed.sealed}, ${sealed.iv}, ${sealed.fingerprint}, ${SIGNING_ALG})
    returning created_at
  `) as { created_at: string }[];
  await sql`
    update public.oauth_signing_keys
       set retired_at = now()
     where retired_at is null and kid <> ${kid} and created_at <= ${inserted[0]!.created_at}
  `;
  console.info(`[oidc-keys] rotated signing key (${reason}); new kid ${kid}`);
  cache = null;
  return kid;
}

/** Wipes private parts of keys retired longer than the grace period (and of revoked keys). */
export async function wipeRetiredPrivateParts(now = new Date()): Promise<number> {
  const kids = privatePartsToWipe(await loadKeys(), now);
  for (const kid of kids) {
    await sql`
      update public.oauth_signing_keys
         set private_jwk = null, private_jwk_sealed = null, private_jwk_iv = null
       where kid = ${kid}
    `;
  }
  return kids.length;
}

type ActiveKey = { kid: string; privateKey: CryptoKey };
const CACHE_MS = 5 * 60 * 1000;
let cache: { key: ActiveKey; at: number } | null = null;
let warnedLegacy = false;

async function importSigningKey(jwk: Jwk): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

/** The key that signs right now; rotates first when the rules say so. */
export async function activeKey(now = new Date()): Promise<ActiveKey> {
  if (cache && now.getTime() - cache.at < CACHE_MS) return cache.key;
  const kek = await currentKek();
  const fingerprint = await kekFingerprint(kek);
  let keys = await loadKeys();
  let active = activeSigningKey(keys);
  const reason = rotationReason(active, fingerprint, now);
  if (reason === "kek_conflict") {
    console.error(
      "[oidc-keys] KEK mismatch: the active signing key was sealed less than an hour ago with a different ROUT_PROVIDER_SIGNING_KEK. Use one value on every deployment.",
    );
    throw new Error("Ondertekensleutel is verzegeld met een andere sleutel (ROUT_PROVIDER_SIGNING_KEK verschilt tussen omgevingen).");
  }
  if (reason) {
    await rotateSigningKey(reason);
    keys = await loadKeys();
    active = activeSigningKey(keys);
  }
  const loaded = keys.find((k) => k.kid === active?.kid);
  if (!loaded) throw new Error("Geen bruikbare ondertekensleutel.");
  let jwk: Jwk;
  if (loaded.storage === "sealed") {
    jwk = (await openPrivateJwk(loaded.kid, loaded.row.private_jwk_sealed!, loaded.row.private_jwk_iv!, kek)) as Jwk;
  } else {
    if (!warnedLegacy) {
      warnedLegacy = true;
      console.warn("[oidc-keys] signing with a legacy plaintext key; run `bun scripts/seal-signing-keys.ts` once every deployment runs this code.");
    }
    jwk = loaded.row.private_jwk!;
  }
  const key = { kid: loaded.kid, privateKey: await importSigningKey(jwk) };
  cache = { key, at: now.getTime() };
  // Housekeeping never blocks signing.
  void wipeRetiredPrivateParts(now).catch((e: unknown) => console.warn("[oidc-keys] wipe failed", e));
  return key;
}

/** Public JWKS: active key plus retired keys still inside the grace period. */
export async function publicJwks(now = new Date()): Promise<{ keys: Jwk[] }> {
  let keys = await loadKeys();
  if (!activeSigningKey(keys)) {
    await activeKey(now);
    keys = await loadKeys();
  }
  return {
    keys: publishedKeys(keys, now).map((k) => {
      const { kty, crv, x, y } = k.row.public_jwk;
      return { kty, crv, x, y, kid: k.kid, alg: SIGNING_ALG, use: "sig" };
    }),
  };
}

/** The public key for a token header, or null when the token must be rejected. */
export async function verificationKey(header: JwtHeader, now = new Date()): Promise<CryptoKey | null> {
  const keys = await loadKeys();
  const kid = verificationKidFor(header, keys, now);
  if (!kid) return null;
  const jwk = keys.find((k) => k.kid === kid)!.row.public_jwk;
  return crypto.subtle.importKey("jwk", { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, { name: "ECDSA", namedCurve: "P-256" }, false, [
    "verify",
  ]);
}

/**
 * One-time step after every deployment runs this code: replaces a legacy
 * plaintext key with a sealed one. The old key stays published for the grace
 * period; its private part is wiped right away because it no longer signs.
 */
export async function sealLegacyKeys(): Promise<{ rotated: boolean; wiped: number }> {
  const keys = await loadKeys();
  const legacy = keys.filter((k) => k.storage === "legacy_plaintext");
  if (legacy.length === 0) return { rotated: false, wiped: 0 };
  const active = activeSigningKey(keys);
  let rotated = false;
  if (!active || active.storage === "legacy_plaintext") {
    await rotateSigningKey("seal_legacy");
    rotated = true;
  }
  for (const k of legacy) {
    await sql`
      update public.oauth_signing_keys
         set private_jwk = null, retired_at = coalesce(retired_at, now())
       where kid = ${k.kid}
    `;
  }
  return { rotated, wiped: legacy.length };
}

export { RETIRED_KEY_GRACE_MS };
