import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";

/** JWKS is obtained by the server's trusted provider configuration, never from token jku/x5u. */
export async function validateOidcProof(input: { idToken: string; issuer: string; audience: string; nonce: string; jwks: JSONWebKeySet; now?: Date }) {
  if (!input.nonce || input.idToken.length > 32768) throw new Error("invalid_oidc_proof");
  const { payload } = await jwtVerify(input.idToken, createLocalJWKSet(input.jwks), {
    issuer: input.issuer,
    audience: input.audience,
    algorithms: ["RS256", "ES256"],
    requiredClaims: ["iss", "sub", "aud", "exp", "iat", "nonce"],
    currentDate: input.now,
    clockTolerance: 0,
  });
  if (typeof payload.sub !== "string" || !payload.sub || payload.nonce !== input.nonce) throw new Error("invalid_oidc_subject_or_nonce");
  const proofDigest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input.idToken)));
  return { issuer: input.issuer, providerSub: payload.sub, proofMethod: "oidc_id_token" as const, proofDigest };
}