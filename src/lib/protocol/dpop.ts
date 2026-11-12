/**
 * DPoP proofs (RFC 9449) with Ed25519 (`alg: EdDSA`, OKP JWK). A proof is a
 * one-time JWS over the request method + URL + time, signed by the caller's
 * identity key, so a captured request cannot be replayed elsewhere or later.
 * The key in the proof header is the caller's did:key: the same key must sign
 * the ledger event the request carries.
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { didFromPublicKey } from "./did-key";
import { fromB64u, sha256Bytes, toB64u, utf8 } from "./encoding";

export const DPOP_MAX_AGE_S = 60;
export const DPOP_MAX_FUTURE_S = 5;

export type DpopClaims = { jti: string; htm: string; htu: string; iat: number; ath?: string };
export type DpopOk = { ok: true; did: string; jkt: string; jti: string; iat: number };
export type DpopError = "dpop_missing" | "dpop_malformed" | "dpop_signature_invalid" | "dpop_method_mismatch" | "dpop_url_mismatch" | "dpop_stale" | "dpop_ath_mismatch";

const json = (b: Uint8Array) => JSON.parse(new TextDecoder().decode(b)) as unknown;

/** Scheme + host + path, no query or fragment (RFC 9449 §4.3). */
export function normalizeHtu(u: string): string | null {
  try {
    const url = new URL(u);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return `${url.protocol}//${url.host}${url.pathname}`.toLowerCase();
  } catch {
    return null;
  }
}

export const jwkThumbprint = (x: string): string => toB64u(sha256Bytes(utf8(`{"crv":"Ed25519","kty":"OKP","x":"${x}"}`)));
export const accessTokenHash = (token: string): string => toB64u(sha256Bytes(utf8(token)));

export type DpopExpect = {
  method: string;
  /** Every URL the request may legitimately have been addressed to (proxied origin + public origin). */
  urls: string[];
  nowS?: number;
  accessToken?: string;
};

export function verifyDpop(proof: string | null | undefined, expect: DpopExpect): DpopOk | { ok: false; error: DpopError } {
  if (!proof) return { ok: false, error: "dpop_missing" };
  if (proof.length > 4096) return { ok: false, error: "dpop_malformed" };
  const parts = proof.split(".");
  if (parts.length !== 3) return { ok: false, error: "dpop_malformed" };
  let header: { typ?: unknown; alg?: unknown; jwk?: { kty?: unknown; crv?: unknown; x?: unknown; d?: unknown } };
  let claims: Partial<DpopClaims>;
  let sig: Uint8Array;
  let pk: Uint8Array;
  try {
    header = json(fromB64u(parts[0])) as typeof header;
    claims = json(fromB64u(parts[1])) as Partial<DpopClaims>;
    sig = fromB64u(parts[2]);
    if (header.typ !== "dpop+jwt" || header.alg !== "EdDSA") throw 0;
    const jwk = header.jwk;
    if (!jwk || jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || typeof jwk.x !== "string" || jwk.d !== undefined) throw 0;
    pk = fromB64u(jwk.x);
    if (pk.length !== 32 || sig.length !== 64) throw 0;
  } catch {
    return { ok: false, error: "dpop_malformed" };
  }
  if (typeof claims.jti !== "string" || claims.jti.length < 16 || claims.jti.length > 128) return { ok: false, error: "dpop_malformed" };
  if (typeof claims.htm !== "string" || typeof claims.htu !== "string" || !Number.isSafeInteger(claims.iat)) return { ok: false, error: "dpop_malformed" };
  let valid = false;
  try {
    valid = ed25519.verify(sig, utf8(`${parts[0]}.${parts[1]}`), pk);
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, error: "dpop_signature_invalid" };
  if (claims.htm !== expect.method.toUpperCase()) return { ok: false, error: "dpop_method_mismatch" };
  const htu = normalizeHtu(claims.htu);
  const accepted = new Set(expect.urls.map(normalizeHtu).filter((x): x is string => !!x));
  if (!htu || !accepted.has(htu)) return { ok: false, error: "dpop_url_mismatch" };
  const now = expect.nowS ?? Math.floor(Date.now() / 1000);
  const iat = claims.iat as number;
  if (iat > now + DPOP_MAX_FUTURE_S || now - iat > DPOP_MAX_AGE_S) return { ok: false, error: "dpop_stale" };
  if (expect.accessToken !== undefined && claims.ath !== accessTokenHash(expect.accessToken)) return { ok: false, error: "dpop_ath_mismatch" };
  const x = header.jwk!.x as string;
  return { ok: true, did: didFromPublicKey(pk), jkt: jwkThumbprint(x), jti: claims.jti, iat };
}

/** Creates a proof (enclave worker, agents, tests). */
export function createDpopProof(secretKey: Uint8Array, method: string, url: string, opts: { nowS?: number; accessToken?: string; jti?: string } = {}): string {
  const x = toB64u(ed25519.getPublicKey(secretKey));
  const header = toB64u(utf8(JSON.stringify({ typ: "dpop+jwt", alg: "EdDSA", jwk: { kty: "OKP", crv: "Ed25519", x } })));
  const claims: DpopClaims = {
    jti: opts.jti ?? toB64u(crypto.getRandomValues(new Uint8Array(18))),
    htm: method.toUpperCase(),
    htu: normalizeHtu(url) ?? url,
    iat: opts.nowS ?? Math.floor(Date.now() / 1000),
    ...(opts.accessToken !== undefined ? { ath: accessTokenHash(opts.accessToken) } : {}),
  };
  const payload = toB64u(utf8(JSON.stringify(claims)));
  return `${header}.${payload}.${toB64u(ed25519.sign(utf8(`${header}.${payload}`), secretKey))}`;
}
