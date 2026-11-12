import { z } from "zod";

export const immutableDid = z.string().max(2048).refine((value) => /^did:plc:[a-z2-7]{24}$/.test(value)
  || /^did:web:[a-z0-9.-]+(?::[A-Za-z0-9._%-]+)*$/.test(value), "invalid_did");

/** Inputs come from the validated AT OAuth/DPoP exchange, never a submitted handle. */
export async function validateAtprotoProof(input: { requestedDid: string; tokenSubject: string; authenticatedDid: string; issuer: string; validatedEvidence: string }) {
  const did = immutableDid.parse(input.requestedDid);
  if (did !== input.tokenSubject || did !== input.authenticatedDid || !input.validatedEvidence) throw new Error("atproto_subject_mismatch");
  return { issuer: input.issuer, providerSub: did, proofMethod: "atproto_oauth" as const,
    proofDigest: new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input.validatedEvidence))) };
}