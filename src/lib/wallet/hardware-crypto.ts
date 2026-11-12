/**
 * Challenge-response crypto for physical ROUT keys (secure element). Pure
 * WebCrypto, runs on the edge worker. The chip signs the server nonce with its
 * private key; we verify with the public key stored at provisioning.
 *  - Ed25519: raw 32-byte public key, 64-byte signature
 *  - P-256:   raw 65-byte uncompressed public key, 64-byte r||s signature (SHA-256)
 */
export type KeyAlg = "Ed25519" | "P-256";

export function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export function validPublicKey(alg: KeyAlg, b64: string): boolean {
  const k = b64urlDecode(b64);
  if (!k) return false;
  return alg === "Ed25519" ? k.length === 32 : k.length === 65 && k[0] === 4;
}

/** The exact bytes a chip signs: domain label + hardware id + nonce. */
export function challengeMessage(hardwareId: string, nonce: string): Uint8Array {
  return new TextEncoder().encode(`rout-hw-challenge:v1|${hardwareId.toLowerCase()}|${nonce}`);
}

export async function sha256Hex(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Never throws: any malformed key or signature is simply "false". */
export async function verifyChipSignature(alg: KeyAlg, publicKey: string, message: Uint8Array, signature: string): Promise<boolean> {
  const pk = b64urlDecode(publicKey);
  const sig = b64urlDecode(signature);
  if (!pk || !sig || sig.length !== 64 || !validPublicKey(alg, publicKey)) return false;
  try {
    if (alg === "Ed25519") {
      const key = await crypto.subtle.importKey("raw", pk as BufferSource, { name: "Ed25519" }, false, ["verify"]);
      return await crypto.subtle.verify({ name: "Ed25519" }, key, sig as BufferSource, message as BufferSource);
    }
    const key = await crypto.subtle.importKey("raw", pk as BufferSource, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, sig as BufferSource, message as BufferSource);
  } catch {
    return false;
  }
}

/** Short-lived access token for a terminal after a successful handshake (5 min). */
export async function signAccessToken(key: Uint8Array, hardwareId: string, now: number): Promise<string> {
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify({ v: 1, hid: hardwareId, iat: now, exp: now + 300_000 })));
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`rout-hw-access:v1|${body}`)));
  return `${body}.${b64urlEncode(mac)}`;
}

/** Normalises an NFC UID from WebNFC ("04:a2:...") to upper-case hex with colons. */
export function normalizeNfcUid(raw: string): string | null {
  const hex = raw.replace(/[^0-9a-f]/gi, "").toUpperCase();
  if (hex.length < 8 || hex.length > 20 || hex.length % 2) return null;
  return hex.match(/../g)!.join(":");
}
