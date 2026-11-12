import { useMemo } from "react";
import { DEBUG_ZONE_COLORS, zoneOf } from "@/lib/qr-structure";

/**
 * Developer "Debug Render Mesh" overlay.
 *
 * Colour-codes the matrix zones on top of the live preview so a timing-pattern
 * regression (squares reappearing in the magenta lanes while an organic style
 * is active) is visible at a glance. Purely visual: it never touches the
 * exported artwork.
 */
export function DebugMeshOverlay({ bits }: { bits: string[] }) {
  const rects = useMemo(() => {
    const count = bits.length;
    const out: string[] = [];
    for (let y = 0; y < count; y += 1) {
      for (let x = 0; x < count; x += 1) {
        if (bits[y]?.[x] !== "1") continue;
        out.push(
          `<rect x="${x}" y="${y}" width="1" height="1" fill="${DEBUG_ZONE_COLORS[zoneOf(x, y, count)]}"/>`,
        );
      }
    }
    return out.join("");
  }, [bits]);

  if (!bits.length) return null;
  const count = bits.length;

  return (
    <div
      data-testid="debug-mesh-overlay"
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10"
    >
      <svg
        viewBox={`0 0 ${count} ${count}`}
        className="h-full w-full opacity-70"
        dangerouslySetInnerHTML={{ __html: rects }}
      />
    </div>
  );
}

/** Legend rendered next to the toggle so zone colours are self-documenting. */
export const DEBUG_ZONE_LEGEND = [
  { label: "Finder", color: DEBUG_ZONE_COLORS.finder },
  { label: "Timing / alignment", color: DEBUG_ZONE_COLORS.timing },
  { label: "Data", color: DEBUG_ZONE_COLORS.data },
];
