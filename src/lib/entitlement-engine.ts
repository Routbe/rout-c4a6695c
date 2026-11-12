/** Pure entitlement rules per scope (personal account or workspace). Unit-tested; the server loads inputs. */

export type ScopeType = "user" | "workspace";
export type Scope = { type: "user"; id: string } | { type: "workspace"; id: string };

export const ENTITLEMENT_KEYS = {
  PRO_FOR_LIFE: "PRO_FOR_LIFE",
  INCLUDED_PLUS_WORKSPACE: "INCLUDED_PLUS_WORKSPACE",
  WORKSPACE_PLAN: "WORKSPACE_PLAN",
} as const;

export type PlanTier = "free" | "plus" | "pro" | "business";

/** Storage quota per tier, in MB. Free workspaces get nothing. */
export const STORAGE_QUOTA_MB: Record<ScopeType, Record<PlanTier, number>> = {
  user: { free: 100, plus: 2048, pro: 10240, business: 51200 },
  workspace: { free: 0, plus: 2048, pro: 10240, business: 51200 },
};

export type Override = { entitlement_key: string; value: string };

export type ScopeInput = {
  scopeType: ScopeType;
  /** Stored plan (profile is_paid → "pro"; workspace plan column). */
  basePlan: string | null;
  /** User verified (personal) or workspace owner-verified (workspace). */
  verified: boolean;
  overrides: readonly Override[];
};

function normalizePlan(p: string | null | undefined): PlanTier {
  return p === "plus" || p === "pro" || p === "business" ? p : "free";
}

const RANK: Record<PlanTier, number> = { free: 0, plus: 1, pro: 2, business: 3 };
const best = (a: PlanTier, b: PlanTier) => (RANK[b] > RANK[a] ? b : a);

export function effectivePlan(input: ScopeInput): PlanTier {
  let plan = normalizePlan(input.basePlan);
  for (const o of input.overrides) {
    if (input.scopeType === "user" && o.entitlement_key === ENTITLEMENT_KEYS.PRO_FOR_LIFE && o.value === "true") plan = best(plan, "pro");
    if (input.scopeType === "workspace" && o.entitlement_key === ENTITLEMENT_KEYS.WORKSPACE_PLAN) plan = best(plan, normalizePlan(o.value));
  }
  return plan;
}

/** Hard storage quota in bytes. Unverified workspaces are always 0. */
export function storageQuotaBytes(input: ScopeInput): number {
  if (input.scopeType === "workspace" && !input.verified) return 0;
  return STORAGE_QUOTA_MB[input.scopeType][effectivePlan(input)] * 1024 * 1024;
}

export type PresignDecision = { ok: true } | { ok: false; status: 403; error: "Storage Quota Exceeded" };

export function decidePresign(input: ScopeInput, usedBytes: number, requestedBytes: number): PresignDecision {
  const quota = storageQuotaBytes(input);
  if (quota <= 0 || usedBytes + Math.max(0, requestedBytes) > quota) {
    return { ok: false, status: 403, error: "Storage Quota Exceeded" };
  }
  return { ok: true };
}

/** Overrides granted once when a user verifies during the early phase. */
export function earlyVerifiedGrants(userId: string): Array<{ scope_type: ScopeType; scope_id: string; entitlement_key: string; value: string }> {
  return [
    { scope_type: "user", scope_id: userId, entitlement_key: ENTITLEMENT_KEYS.PRO_FOR_LIFE, value: "true" },
    { scope_type: "user", scope_id: userId, entitlement_key: ENTITLEMENT_KEYS.INCLUDED_PLUS_WORKSPACE, value: "1" },
  ];
}

/** Remaining "free Plus workspace" credits from the stored override value. */
export function plusCredits(overrides: readonly Override[]): number {
  const o = overrides.find((x) => x.entitlement_key === ENTITLEMENT_KEYS.INCLUDED_PLUS_WORKSPACE);
  const n = Number(o?.value ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Shown when the active scope (e.g. a free workspace) has no storage left. */
export const STORAGE_QUOTA_MESSAGE = "Opslaglimiet bereikt voor deze omgeving (Storage Quota Exceeded). Upgrade de workspace of upload in je persoonlijke omgeving.";

export type ScopeStorageSummary = { scopeType: ScopeType; plan: PlanTier; usedBytes: number; quotaBytes: number; blocked: boolean; message: string | null };

/** Storage figures for the active scope, so the UI never shows the personal quota inside a workspace. */
export function scopeStorageSummary(input: ScopeInput, usedBytes: number): ScopeStorageSummary {
  const quotaBytes = storageQuotaBytes(input);
  const blocked = quotaBytes <= 0 || usedBytes >= quotaBytes;
  return { scopeType: input.scopeType, plan: effectivePlan(input), usedBytes, quotaBytes, blocked, message: blocked ? STORAGE_QUOTA_MESSAGE : null };
}
