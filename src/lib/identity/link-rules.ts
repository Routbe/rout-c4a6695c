/** Browser-safe invariants. Authentication proofs are supplied only by server code. */
export const IDENTITY_EMAIL_CONFLICT = "Er bestaat al een account met dit e-mailadres. Log eerst in met je bestaande methode en koppel dit account handmatig in je instellingen.";
export const IDENTITY_STEP_UP_MAX_AGE_MS = 5 * 60 * 1000;
export const EXPLICIT_ACCOUNT_LINKING = {
  enabled: true,
  disableImplicitLinking: true,
  trustedProviders: [] as string[],
  allowDifferentEmails: true,
};

export function ownsAuthIdentity(userId: unknown, mappedAuthId: unknown, authId: string): boolean {
  return mappedAuthId === authId || (mappedAuthId == null && userId === authId);
}

export function freshIdentityStepUp(method: string, verifiedAt: number, now: number): boolean {
  return ["passkey", "totp", "email_code"].includes(method) && Number.isFinite(verifiedAt)
    && verifiedAt <= now && now - verifiedAt <= IDENTITY_STEP_UP_MAX_AGE_MS;
}

export function normalizeIdentityIssuer(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("invalid_issuer");
  }
  return url.toString().toLowerCase().replace(/\/+$/, "");
}

export function mastodonSubject(origin: string, accountId: string): string {
  if (!/^\d+$/.test(accountId)) throw new Error("invalid_mastodon_subject");
  const issuer = normalizeIdentityIssuer(origin);
  if (new URL(issuer).pathname !== "/") throw new Error("invalid_mastodon_origin");
  return `${issuer}#${accountId}`;
}