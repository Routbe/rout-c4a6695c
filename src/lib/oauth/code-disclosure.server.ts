/**
 * Seals a one-time disclosure (the account a member confirmed through Blind
 * Hash Matching) inside the authorization code itself, so nothing about it is
 * written to the database. The code is `<random>.<iv>.<ciphertext>`; the
 * random part is the AES-GCM additional data, and the whole string is what
 * `oauth_auth_codes.code_hash` covers, so a changed suffix finds no row.
 */
import type { BhmIdentity } from "./blind-hash";
import { isBhmKind } from "./blind-hash";

const LABEL = "rout-bhm-code-disclosure-v1";
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function key(secret: string): Promise<CryptoKey> {
  if (!secret || secret.length < 32) throw new Error("disclosure_secret_missing");
  const ikm = await crypto.subtle.importKey("raw", enc.encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: enc.encode(LABEL) },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function sealCodeDisclosure(random: string, identity: BhmIdentity, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(random) },
    await key(secret),
    enc.encode(JSON.stringify({ k: identity.kind, v: identity.value })),
  ));
  return `${random}.${b64u(iv)}.${b64u(ct)}`;
}

/** Returns null for a plain code; throws nothing — a broken suffix simply discloses nothing. */
export async function openCodeDisclosure(code: string, secret: string): Promise<BhmIdentity | null> {
  const parts = code.split(".");
  if (parts.length !== 3) return null;
  try {
    const [random, iv, ct] = parts as [string, string, string];
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64u(iv) as BufferSource, additionalData: enc.encode(random) },
      await key(secret),
      unb64u(ct) as BufferSource,
    );
    const o = JSON.parse(dec.decode(pt)) as { k?: unknown; v?: unknown };
    return isBhmKind(o.k) && typeof o.v === "string" && o.v ? { kind: o.k, value: o.v } : null;
  } catch {
    return null;
  }
}
