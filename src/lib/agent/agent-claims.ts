import { z } from "zod";

/**
 * Pure rules for agent-provisioned workspace claims (claim link only, zero
 * e-mail). Browser-safe: no env reads, no I/O.
 *
 * Zero-trust rules:
 * - The claim token is 32 random bytes as hex; only its SHA-256 hash is stored.
 * - A staging workspace lives exactly 24 hours; unclaimed means hard-deleted.
 * - Provisioning accepts no e-mail address — the agent delivers the link.
 */

export const AGENT_WORKSPACE_TTL_HOURS = 24;
export const AGENT_WORKSPACE_TOKEN_BYTES = 32;

/** 64 lowercase hex characters (32 bytes). */
export const CLAIM_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

export function isClaimToken(value: string): boolean {
  return CLAIM_TOKEN_PATTERN.test(value);
}

export function generateClaimToken(randomBytes: (n: number) => Uint8Array): string {
  return [...randomBytes(AGENT_WORKSPACE_TOKEN_BYTES)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashClaimToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Workspace slugs: lowercase, 3–48 chars, alphanumerics and single hyphens. */
export const WORKSPACE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9]-?){1,46}[a-z0-9]$/;

export function isWorkspaceSlug(slug: string): boolean {
  return WORKSPACE_SLUG_PATTERN.test(slug);
}

export function claimUrl(origin: string, token: string): string {
  return `${origin}/claim/workspace/${token}`;
}

/** The 24-hour lifetime is exact — the database constraint enforces the same. */
export function claimExpiry(createdAt: Date): Date {
  return new Date(createdAt.getTime() + AGENT_WORKSPACE_TTL_HOURS * 60 * 60 * 1000);
}

/**
 * Provisioning input. strictObject: an `email` field — or any other unexpected
 * field — is rejected outright. Agents never hand ROUT an e-mail address.
 */
export const agentProvisionInput = z.strictObject({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().toLowerCase().refine(isWorkspaceSlug, "3–48 lowercase letters, digits and single hyphens"),
  description: z.string().trim().max(500).optional(),
});
export type AgentProvisionInput = z.infer<typeof agentProvisionInput>;

/** Failure reasons the database function can raise while provisioning. */
export type ProvisionFailure = "agent_quota_reached" | "slug_taken" | "not_authenticated";

export function provisionFailure(message: string): ProvisionFailure | null {
  if (message.includes("agent_quota_reached")) return "agent_quota_reached";
  if (message.includes("slug_taken")) return "slug_taken";
  if (message.includes("not_authenticated")) return "not_authenticated";
  return null;
}

export type ClaimFailure = "claim_not_found" | "claim_used" | "claim_expired";

export function claimFailure(message: string): ClaimFailure | null {
  if (message.includes("claim_not_found")) return "claim_not_found";
  if (message.includes("claim_used")) return "claim_used";
  if (message.includes("claim_expired")) return "claim_expired";
  return null;
}

export type ClaimState = "open" | "claimed" | "expired" | "invalid";

export function claimState(preview: { claimed: boolean; expired: boolean } | null | undefined): ClaimState {
  if (!preview) return "invalid";
  if (preview.claimed) return "claimed";
  if (preview.expired) return "expired";
  return "open";
}
