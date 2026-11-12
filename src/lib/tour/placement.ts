export type Side = "bottom" | "top" | "right" | "left";
export interface Box { top: number; left: number; width: number; height: number }
export interface Insets { top: number; right: number; bottom: number; left: number }

const GAP = 12;
const MARGIN = 12;

/**
 * Place a tooltip next to a target, flipping through bottom → top → right →
 * left until it fits inside the viewport minus the safe-area insets. When
 * nothing fits (tiny phone, huge translation) it docks to the bottom edge.
 */
export function placeTooltip(
  target: Box,
  tip: { width: number; height: number },
  viewport: { width: number; height: number },
  insets: Insets,
): { top: number; left: number; side: Side | "dock" } {
  const minX = insets.left + MARGIN;
  const maxX = viewport.width - insets.right - MARGIN;
  const minY = insets.top + MARGIN;
  const maxY = viewport.height - insets.bottom - MARGIN;
  const clampX = (x: number) => Math.max(minX, Math.min(x, maxX - tip.width));
  const clampY = (y: number) => Math.max(minY, Math.min(y, maxY - tip.height));

  const candidates: { side: Side; top: number; left: number; fits: boolean }[] = [
    { side: "bottom", top: target.top + target.height + GAP, left: clampX(target.left), fits: target.top + target.height + GAP + tip.height <= maxY },
    { side: "top", top: target.top - GAP - tip.height, left: clampX(target.left), fits: target.top - GAP - tip.height >= minY },
    { side: "right", top: clampY(target.top), left: target.left + target.width + GAP, fits: target.left + target.width + GAP + tip.width <= maxX },
    { side: "left", top: clampY(target.top), left: target.left - GAP - tip.width, fits: target.left - GAP - tip.width >= minX },
  ];
  const hit = candidates.find((c) => c.fits);
  if (hit) return { top: hit.top, left: hit.left, side: hit.side };
  return { top: Math.max(minY, maxY - tip.height), left: clampX(minX), side: "dock" };
}
