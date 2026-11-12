// Hybrid W3C DIDs: did:jwk is the root identity; did:web (rout.be/u/<handle>) is an alias
// whose document embeds the did:jwk key in verificationMethod + assertionMethod.
import { b64u } from "./crypto";

const enc = new TextEncoder();
export type PublicJwk = { kty: "EC"; crv: "P-256"; x: string; y: string };

export async function newSigningKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
}

export async function publicJwk(key: CryptoKey): Promise<PublicJwk> {
  const { kty, crv, x, y } = await crypto.subtle.exportKey("jwk", key);
  return { kty: kty as "EC", crv: crv as "P-256", x: x!, y: y! };
}

export const didJwk = (jwk: PublicJwk) =>
  `did:jwk:${b64u.encode(enc.encode(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })))}`;

export function jwkFromDid(did: string): PublicJwk {
  if (!did.startsWith("did:jwk:")) throw new Error("Not a did:jwk");
  const jwk = JSON.parse(new TextDecoder().decode(b64u.decode(did.slice(8))));
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.x || !jwk.y || jwk.d) throw new Error("Unsupported did:jwk key");
  return { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y };
}

export function didWeb(host: string, handle: string): string {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(handle)) throw new Error("Invalid handle");
  return `did:web:${encodeURIComponent(host)}:u:${handle.toLowerCase()}`;
}

export function didWebDocument(webDid: string, rootDid: string) {
  const vm = `${rootDid}#0`;
  return {
    "@context": ["https://www.w3.org/ns/did/v1", "https://w3id.org/security/suites/jws-2020/v1"],
    id: webDid,
    alsoKnownAs: [rootDid],
    verificationMethod: [{ id: vm, type: "JsonWebKey2020", controller: rootDid, publicKeyJwk: jwkFromDid(rootDid) }],
    authentication: [vm],
    assertionMethod: [vm],
  };
}

/** Compact JWS (ES256) over a profile payload; kid = did:jwk#0. */
export async function signPayload(priv: CryptoKey, rootDid: string, payload: unknown): Promise<string> {
  const h = b64u.encode(enc.encode(JSON.stringify({ alg: "ES256", kid: `${rootDid}#0` })));
  const p = b64u.encode(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, priv, enc.encode(`${h}.${p}`));
  return `${h}.${p}.${b64u.encode(new Uint8Array(sig))}`;
}

/** Verifies against the immutable did:jwk, never against the did:web alias. */
export async function verifyPayload<T = unknown>(jws: string, rootDid: string): Promise<T> {
  const [h, p, s] = jws.split(".");
  const header = JSON.parse(new TextDecoder().decode(b64u.decode(h)));
  if (header.alg !== "ES256" || header.kid !== `${rootDid}#0`) throw new Error("Key mismatch");
  const key = await crypto.subtle.importKey("jwk", jwkFromDid(rootDid), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, b64u.decode(s) as BufferSource, enc.encode(`${h}.${p}`));
  if (!ok) throw new Error("Invalid signature");
  return JSON.parse(new TextDecoder().decode(b64u.decode(p))) as T;
}
