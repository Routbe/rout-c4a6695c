import { redirect } from "@tanstack/react-router";
import { canAccessFeature, type GatedFeature } from "./entitlement-rules";
import { getMyEntitlement } from "./entitlement.functions";

/**
 * Client-side route guard for the gated surfaces (Domains, Bluesky).
 *
 * Runs inside `beforeLoad` of routes under `_authenticated` (ssr: false), so a
 * deep link from a free or unverified account never renders the screen. The
 * server functions behind those screens assert entitlement independently — this
 * guard is UX, not the security boundary.
 */
export async function requireFeature(feature: GatedFeature) {
  let snapshot: Awaited<ReturnType<typeof getMyEntitlement>> | null = null;
  try {
    snapshot = await getMyEntitlement();
  } catch {
    snapshot = null;
  }

  if (!canAccessFeature(snapshot, feature)) {
    throw redirect({ to: "/dashboard", replace: true });
  }

  return { entitlement: snapshot! };
}
