/**
 * Structural integrity guard for custom QR rendering.
 *
 * Pixel diffs flake across renderers, so correctness is asserted on the SVG
 * node tree instead: when a non-square style is active, no plain `<rect>` may
 * survive in the timing or alignment zones (finder outer frames excluded).
 */

export type MatrixZone = "finder" | "timing" | "alignment" | "data";

/** Styles that must never fall back to plain squares outside the finders. */
export const CUSTOM_STYLES = ["mesh", "calligraphy", "ballpoint", "chalk", "dots"] as const;
export type CustomStyle = (typeof CUSTOM_STYLES)[number];

export const isCustomStyle = (style: string): style is CustomStyle =>
  (CUSTOM_STYLES as readonly string[]).includes(style);

/** Finder patterns occupy a 7×7 block plus a 1-module separator in each corner. */
export function isFinderZone(x: number, y: number, count: number): boolean {
  const near = (a: number, b: number) => a <= b;
  return (
    (near(x, 7) && near(y, 7)) || (x >= count - 8 && near(y, 7)) || (near(x, 7) && y >= count - 8)
  );
}

/** Row 6 and column 6 carry the timing pattern in every QR version. */
export const isTimingZone = (x: number, y: number) => x === 6 || y === 6;

/** Classify a module so renderers and tests agree on the same zone map. */
export function zoneOf(x: number, y: number, count: number): MatrixZone {
  if (isFinderZone(x, y, count)) return "finder";
  if (isTimingZone(x, y)) return "timing";
  return "data";
}

/** Colour key used by the developer "Debug Render Mesh" overlay. */
export const DEBUG_ZONE_COLORS: Record<MatrixZone, string> = {
  finder: "#2563ff", // neon blue
  timing: "#ff00d4", // neon magenta
  alignment: "#ff00d4",
  data: "#00d97e", // emerald green
};

export interface StructureReport {
  style: string;
  ok: boolean;
  /** Plain <rect> nodes found inside timing/alignment zones. */
  fallbackRects: number;
  totalNodes: number;
  message?: string;
}

const NUM = "-?\\d+(?:\\.\\d+)?";
const RECT_RE = new RegExp(
  `<rect[^>]*?\\bx="(${NUM})"[^>]*?\\by="(${NUM})"[^>]*?\\bwidth="(${NUM})"[^>]*?\\bheight="(${NUM})"[^>]*?>`,
  "g",
);

/**
 * Inspect generated SVG markup for square fallbacks in the timing lanes.
 *
 * `origin` and `module` describe the pixel geometry of the matrix so the rect
 * coordinates can be mapped back onto module indices.
 */
export function inspectSvgStructure(
  svg: string,
  style: string,
  geometry: { count: number; origin: number; module: number },
): StructureReport {
  const totalNodes = (svg.match(/<(path|rect|circle|ellipse|polygon)\b/g) ?? []).length;
  if (!isCustomStyle(style)) return { style, ok: true, fallbackRects: 0, totalNodes };

  const { count, origin, module } = geometry;
  let fallbackRects = 0;
  RECT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = RECT_RE.exec(svg)) !== null) {
    const px = Number(match[1]);
    const py = Number(match[2]);
    const w = Number(match[3]);
    // Background plates span the whole canvas; only module-sized rects count.
    if (module <= 0 || w > module * 1.6) continue;
    const x = Math.round((px - origin) / module);
    const y = Math.round((py - origin) / module);
    if (x < 0 || y < 0 || x >= count || y >= count) continue;
    if (zoneOf(x, y, count) !== "finder" && isTimingZone(x, y)) fallbackRects += 1;
  }

  if (fallbackRects > 0) {
    const message = `[QR Error]: Timing pattern fallback detected for style: ${style}`;
    console.error(message, { fallbackRects, totalNodes });
    return { style, ok: false, fallbackRects, totalNodes, message };
  }
  return { style, ok: true, fallbackRects: 0, totalNodes };
}
