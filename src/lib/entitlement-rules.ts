/**
 * Pure entitlement rules — no I/O, no Postgres, no React.
 *
 * Shared by the server-side gate (entitlement.server.ts) and the client-side
 * route guards so both surfaces can never drift apart, and unit-testable on
 * its own.
 */

export type EntitlementProfileRow = {
  is_paid?: boolean | null;
  verified?: boolean | null;
  is_early_believer?: boolean | null;
  status?: string | null;
  is_banned?: boolean | null;
  is_suspended?: boolean | null;
};

/** Paid / verified / early-believer AND in good standing. */
export function isEntitledProfile(row: EntitlementProfileRow | null | undefined): boolean {
  if (!row) return false;
  const hasTier = row.is_paid === true || row.verified === true || row.is_early_believer === true;
  return hasTier && row.status === "active" && row.is_banned !== true && row.is_suspended !== true;
}

export type GatedFeature = "domains" | "bluesky";

export type EntitlementSnapshot = {
  entitled: boolean;
  verified: boolean;
};

/**
 * Decides whether a signed-in member may open a gated screen.
 * Domains needs entitlement; Bluesky additionally needs legal verification.
 */
export function canAccessFeature(
  snapshot: EntitlementSnapshot | null | undefined,
  feature: GatedFeature,
): boolean {
  if (!snapshot?.entitled) return false;
  if (feature === "bluesky") return snapshot.verified === true;
  return true;
}
