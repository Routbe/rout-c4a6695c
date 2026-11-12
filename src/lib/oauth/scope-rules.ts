/** Selective-disclosure scopes for "Login met ROUT". Pure and browser-safe. */
import { AGENT_SCOPES } from "@/lib/agent/agent-scopes";

export const IDENTITY_SCOPES = ["sybil:verify", "profile:read", "identity:legal_name", "identity:national_id"] as const;
export type IdentityScope = (typeof IDENTITY_SCOPES)[number];

/** Scopes the member can switch off on the consent screen (openid never). */
export const OPTIONAL_SCOPES: readonly string[] = ["accounts:merge", "identity:handle_reservation", "sybil:verify", "profile:read", "identity:legal_name", "identity:national_id", ...AGENT_SCOPES];

/** Scopes whose disclosure is written to identity_disclosure_logs. */
export const SENSITIVE_SCOPES: readonly string[] = ["sybil:verify", "identity:legal_name", "identity:national_id"];

export type Tier = "none" | "tier_1" | "tier_2";

/** Removes the scopes the member switched off; `openid` always stays. */
export function applyConsentToggles(scopes: string[], declined: string[] = []): string[] {
  const off = new Set(declined.filter((s) => OPTIONAL_SCOPES.includes(s)));
  return scopes.filter((s) => s === "openid" || !off.has(s));
}

export type ScopeDecision = { ok: true } | { ok: false; status: 403; error: string };

/**
 * National registry number: only for a trusted KYC partner, a tier-2 member and a
 * token issued after a fresh step-up. Anything else is 403.
 */
export function nationalIdDecision(input: { trustedPartner: boolean; tier: Tier; stepUp: boolean }): ScopeDecision {
  if (!input.trustedPartner) return { ok: false, status: 403, error: "client_not_trusted_kyc_partner" };
  if (input.tier !== "tier_2") return { ok: false, status: 403, error: "tier_2_required" };
  if (!input.stepUp) return { ok: false, status: 403, error: "step_up_required" };
  return { ok: true };
}

/** Legal name requires tier 2; sybil proof requires tier 1 or 2. Missing tier = claim omitted. */
export function tierAllows(scope: string, tier: Tier): boolean {
  if (scope === "identity:legal_name" || scope === "identity:national_id") return tier === "tier_2";
  if (scope === "sybil:verify") return tier === "tier_1" || tier === "tier_2";
  return true;
}

/** The sensitive scopes that were actually disclosed in one response. */
export function disclosedSensitive(granted: string[], tier: Tier): string[] {
  return granted.filter((s) => SENSITIVE_SCOPES.includes(s) && tierAllows(s, tier));
}

/** Splits "Jona Zeno Delplanche" into first (all but last) and last name. */
export function splitLegalName(full: string | null): { first_name: string | null; last_name: string | null; full_legal_name: string | null } {
  const clean = (full ?? "").trim().replace(/\s+/g, " ");
  if (!clean) return { first_name: null, last_name: null, full_legal_name: null };
  const parts = clean.split(" ");
  if (parts.length === 1) return { first_name: parts[0]!, last_name: null, full_legal_name: clean };
  return { first_name: parts.slice(0, -1).join(" "), last_name: parts[parts.length - 1]!, full_legal_name: clean };
}

/* ---------------------------------------------------- whitelist (Cluster C) ---- */

/**
 * Authoritative whitelist of every scope ROUT may issue. This is the single
 * source of truth: `provider.server.ts` re-exports it, the authorize screen and
 * the token endpoint both enforce it, and the discovery document advertises it.
 */
export const SUPPORTED_SCOPES = [
  "openid",
  "profile",
  "email",
  "linked_accounts",
  "offline_access",
  // Blind Hash Matching: one confirmed identity, id_token only (blind-hash.ts).
  "accounts:merge",
  "sybil:verify",
  "profile:read",
  "identity:legal_name",
  "identity:national_id",
  // Anti-bot handle claiming: a vouched-for @handle the app may adopt (handle-reservation.ts).
  "identity:handle_reservation",
  // Agent scopes: human-delegated, short-lived tokens only (src/lib/agent/agent-scopes.ts).
  ...AGENT_SCOPES,
] as const;
export type SupportedScope = (typeof SUPPORTED_SCOPES)[number];

export type ScopeValidation =
  | { ok: true; scopes: string[] }
  | { ok: false; unknown: string };

/**
 * Validates a requested scope set against the whitelist and the client's
 * registered scopes. `openid` is always present in the result. The first
 * offending scope is reported so the caller can answer `invalid_scope`
 * before any consent screen is shown.
 */
export function validateRequestedScopes(requested: string[], clientScopes: string[]): ScopeValidation {
  const scopes = [...new Set(requested.filter((s) => clientScopes.includes(s) && (SUPPORTED_SCOPES as readonly string[]).includes(s)))];
  if (!scopes.includes("openid")) scopes.unshift("openid");
  const unknown = requested.find((s) => !scopes.includes(s));
  if (unknown) return { ok: false, unknown };
  return { ok: true, scopes };
}

/**
 * OIDC refresh down-scoping: a refresh request may ask for a narrower scope
 * set, never a wider or unknown one. No requested scope means the original
 * grant is reused unchanged.
 */
export function resolveRefreshScopes(requested: string[] | null, granted: string[]): ScopeValidation {
  if (!requested || requested.length === 0) return { ok: true, scopes: granted };
  const unique = [...new Set(requested)];
  const offending = unique.find(
    (s) => !granted.includes(s) || !(SUPPORTED_SCOPES as readonly string[]).includes(s),
  );
  if (offending) return { ok: false, unknown: offending };
  return { ok: true, scopes: unique };
}

/**
 * Incremental consent: after an earlier grant, the consent screen lists only the
 * new scopes — unless the app forces the full list with prompt=consent.
 */
export function consentDelta(requested: string[], granted: string[], prompt: string | null) {
  const force = (prompt ?? "").split(" ").includes("consent");
  const fresh = requested.filter((s) => s !== "openid" && !granted.includes(s));
  const incremental = !force && granted.some((s) => s !== "openid") && fresh.length > 0;
  return { incremental, shown: incremental ? fresh : requested, previouslyGranted: granted.filter((s) => s !== "openid" && requested.includes(s)) };
}
