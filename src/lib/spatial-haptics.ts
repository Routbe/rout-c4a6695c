/** Optional, best-effort tactile feedback; unsupported browsers remain silent. */
export const SPATIAL_HAPTIC_MS = 12;
export function spatialHaptic() {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  try { navigator.vibrate(SPATIAL_HAPTIC_MS); } catch { /* Never interrupt a menu action. */ }
}