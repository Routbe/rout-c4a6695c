/** Pure mapping between URL-scoped Studio addresses and feature pages. Unit-tested. */
export const SCOPED_FEATURES = {
  studio: "/studio",
  booking: "/studio/booking",
  "dev-console": "/console",
  dashboard: "/dashboard",
} as const;
export type ScopedFeature = keyof typeof SCOPED_FEATURES;

export function isScopedFeature(v: string): v is ScopedFeature {
  return Object.prototype.hasOwnProperty.call(SCOPED_FEATURES, v);
}

/** Feature for a current pathname, so a scope switch stays on the same page. */
export function featureForPath(pathname: string): ScopedFeature {
  const m = pathname.match(/^\/studio\/(?:personal|w\/[^/]+)\/([^/]+)/);
  if (m && isScopedFeature(m[1]!)) return m[1] as ScopedFeature;
  if (pathname.startsWith("/console")) return "dev-console";
  if (pathname.startsWith("/studio/booking")) return "booking";
  if (pathname.startsWith("/dashboard")) return "dashboard";
  return "studio";
}

export function scopedPath(workspaceSlug: string | null, feature: ScopedFeature): string {
  return workspaceSlug ? `/studio/w/${encodeURIComponent(workspaceSlug)}/${feature}` : `/studio/personal/${feature}`;
}
