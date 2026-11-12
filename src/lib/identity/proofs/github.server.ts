import { z } from "zod";

/** Called only after the caller has consumed session-bound state and a fresh step-up. */
export async function validateGithubProof(input: { code: string; verifier: string; clientId: string; clientSecret: string; redirectUri: string }) {
  const verifier = z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/).parse(input.verifier);
  const code = z.string().min(1).max(2048).parse(input.code);
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, code_verifier: verifier, client_id: input.clientId, client_secret: input.clientSecret, redirect_uri: input.redirectUri }),
  });
  if (!response.ok) throw new Error("github_exchange_failed");
  const token = z.object({ access_token: z.string().min(1).max(8192), token_type: z.string().transform((v) => v.toLowerCase()).pipe(z.literal("bearer")) }).parse(await response.json());
  const profileResponse = await fetch("https://api.github.com/user", {
    redirect: "error", signal: AbortSignal.timeout(10000),
    headers: { authorization: `Bearer ${token.access_token}`, accept: "application/vnd.github+json", "user-agent": "ROUT", "x-github-api-version": "2022-11-28" },
  });
  if (!profileResponse.ok) throw new Error("github_userinfo_failed");
  const raw = await profileResponse.text();
  const profile = z.object({ id: z.number().int().positive().safe(), login: z.string().min(1).max(100) }).parse(JSON.parse(raw));
  return { issuer: "https://github.com", providerSub: String(profile.id), displayHandle: profile.login, proofMethod: "oauth_userinfo" as const,
    proofDigest: new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw))) };
}