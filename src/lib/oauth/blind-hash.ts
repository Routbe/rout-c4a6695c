/**
 * Blind Hash Matching (BHM) — pure rules shared by the browser enclave, the
 * consent server function and the developer docs.
 *
 * A partner app sends up to BHM_MAX_HASHES SHA-256 hashes of identifiers it
 * already knows. The member's browser hashes the member's own identities the
 * same way and compares them locally. Only an identity the member confirms is
 * disclosed, once, inside the id_token. ROUT never stores or logs the hashes.
 *
 * Each hash is domain-separated with the partner's client_id, so one app's
 * hashes are useless at another app and generic rainbow tables do not apply.
 */
export const BHM_SCOPE = "accounts:merge";
export const BHM_PARAM = "rout_blind_hashes";
export const BHM_MAX_HASHES = 20;
export const BHM_VERSION = "rout-bhm-v1";

/** Identity kinds a partner can hash. Provider ids are the provider's own stable account id. */
export const BHM_KINDS = ["email", "google", "github", "gitlab", "apple", "microsoft", "discord"] as const;
export type BhmKind = (typeof BHM_KINDS)[number];
export type BhmIdentity = { kind: BhmKind; value: string };

export const isBhmKind = (k: unknown): k is BhmKind => typeof k === "string" && (BHM_KINDS as readonly string[]).includes(k);

/** Emails are trimmed and lower-cased; provider ids are only trimmed (they are case-sensitive). */
export function normalizeIdentityValue(kind: BhmKind, value: string): string {
  const v = value.trim();
  return kind === "email" ? v.toLowerCase() : v;
}

/** The exact text a partner hashes with SHA-256 (hex output). */
export function bhmPreimage(clientId: string, identity: BhmIdentity): string {
  return `${BHM_VERSION}|${clientId}|${identity.kind}:${normalizeIdentityValue(identity.kind, identity.value)}`;
}

/**
 * Parses the comma-separated query value. Anything malformed is dropped,
 * duplicates are removed and the list is capped, so a partner cannot use the
 * screen as an unlimited guessing oracle.
 */
export function parseBlindHashes(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw) return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const h = part.trim().toLowerCase();
    if (/^[0-9a-f]{64}$/.test(h) && !out.includes(h)) out.push(h);
    if (out.length >= BHM_MAX_HASHES) break;
  }
  return out;
}

/** Maps a linked sign-in provider id to a BHM kind; unknown providers are not matchable. */
export function bhmKindForProvider(provider: string): BhmKind | null {
  const p = provider.toLowerCase();
  return isBhmKind(p) && p !== "email" ? p : null;
}
