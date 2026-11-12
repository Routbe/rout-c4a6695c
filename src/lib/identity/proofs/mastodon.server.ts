import { z } from "zod";
import { normalizeIdentityIssuer } from "../link-rules";
import { assertPublicHost } from "@/lib/safe-fetch.server";

export async function validateMastodonProof(origin: string, accessToken: string) {
  const issuer = normalizeIdentityIssuer(origin);
  const url = new URL(issuer);
  if (url.pathname !== "/" || url.port || !(await assertPublicHost(url.hostname))) throw new Error("invalid_mastodon_origin");
  const response = await fetch(`${issuer}/api/v1/accounts/verify_credentials`, {
    redirect: "error", signal: AbortSignal.timeout(10000), headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("mastodon_proof_failed");
  const raw = await response.text();
  const profile = z.object({ id: z.string().regex(/^\d+$/).max(100), acct: z.string().min(1).max(300) }).parse(JSON.parse(raw));
  return { issuer, providerSub: profile.id, displayHandle: profile.acct, proofMethod: "oauth_userinfo" as const,
    proofDigest: new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw))) };
}