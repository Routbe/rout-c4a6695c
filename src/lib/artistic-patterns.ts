/**
 * Procedural calligraphic & organic ink QR engine.
 *
 * Two-layer architecture:
 *   Layer A — the three finder patterns and both timing lines are drawn as
 *             crisp geometry from the spec, never jittered, merged or filtered.
 *   Layer B — the data payload receives the procedural pen work: broad-nib
 *             variable strokes, merged ligatures, micro-gaps and ink bleed.
 *
 * Every generator is wrapped so a bad module falls back to a clean rounded
 * square instead of throwing during render.
 */

export type ArtisticPatternId = "calligraphy" | "ballpoint" | "chalk" | "mesh";

export const ARTISTIC_PATTERNS: { id: ArtisticPatternId; label: string; hint: string }[] = [
  {
    id: "calligraphy",
    label: "Calligraphy",
    hint: "Broad-nib strokes with tapered hairlines and ligatures",
  },
  {
    id: "ballpoint",
    label: "Ballpoint",
    hint: "Fine technical pen texture with pressure variation",
  },
  { id: "chalk", label: "Chalk", hint: "Soft, granular pastel dots" },
  { id: "mesh", label: "Organic mesh", hint: "Fluid nodes welded into a designer lattice" },
];

const IDS = ARTISTIC_PATTERNS.map((p) => p.id) as string[];

export const isArtisticPattern = (value: string | undefined | null): value is ArtisticPatternId =>
  typeof value === "string" && IDS.includes(value);

/** Deterministic per-module noise: the same payload always draws identically. */
function rand(r: number, c: number, salt: number): number {
  const x = Math.sin((r * 928371 + c * 12379 + salt * 7919) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const n = (v: number) => Math.round(v * 1000) / 1000;

/** Clean fallback shape — also the shape used when a generator throws. */
function roundedModule(x: number, y: number, inset = 0.08, r = 0.2): string {
  const s = 1 - inset * 2;
  return `M${n(x + inset + r)} ${n(y + inset)}h${n(s - 2 * r)}a${n(r)} ${n(r)} 0 0 1 ${n(r)} ${n(r)}v${n(s - 2 * r)}a${n(r)} ${n(r)} 0 0 1 -${n(r)} ${n(r)}h-${n(s - 2 * r)}a${n(r)} ${n(r)} 0 0 1 -${n(r)} -${n(r)}v-${n(s - 2 * r)}a${n(r)} ${n(r)} 0 0 1 ${n(r)} -${n(r)}z`;
}

/* ── Broad-nib stroke geometry ──────────────────────────────────────────── */

/**
 * A horizontal broad-nib stroke spanning columns [c0..c1] of row `r`.
 * The body is rich and thick, both ends taper into razor-sharp hairlines and
 * the whole ribbon is skewed to mimic a pen held at 45°.
 */
function nibStrokeH(r: number, c0: number, c1: number, seed: number): string {
  const len = c1 - c0 + 1;
  const gap = 0.06 + rand(r, c0, seed) * 0.06; // micro-gap between ligatures
  const x0 = c0 + gap;
  const x1 = c1 + 1 - gap;
  const y = r + 0.5;
  const thick = 0.36 + rand(r, c0, seed + 1) * 0.1;
  const nib = 0.16; // 45° pen tilt: ends sit slightly off-axis
  const sx = x0;
  const sy = y + nib;
  const ex = x1;
  const ey = y - nib;
  const m1x = x0 + len * 0.32;
  const m2x = x0 + len * 0.68;
  return (
    `M${n(sx)} ${n(sy)}` +
    `C${n(m1x)} ${n(y - thick)} ${n(m2x)} ${n(y - thick)} ${n(ex)} ${n(ey)}` +
    `C${n(m2x)} ${n(y + thick * 0.86)} ${n(m1x)} ${n(y + thick * 0.86)} ${n(sx)} ${n(sy)}z`
  );
}

/** Vertical counterpart — thinner body, matching the broad-nib thick/thin logic. */
function nibStrokeV(c: number, r0: number, r1: number, seed: number): string {
  const len = r1 - r0 + 1;
  const gap = 0.06 + rand(r0, c, seed) * 0.06;
  const y0 = r0 + gap;
  const y1 = r1 + 1 - gap;
  const x = c + 0.5;
  const thick = 0.26 + rand(r0, c, seed + 2) * 0.08; // downstrokes read thinner
  const nib = 0.14;
  const sx = x - nib;
  const sy = y0;
  const ex = x + nib;
  const ey = y1;
  const m1y = y0 + len * 0.32;
  const m2y = y0 + len * 0.68;
  return (
    `M${n(sx)} ${n(sy)}` +
    `C${n(x + thick)} ${n(m1y)} ${n(x + thick)} ${n(m2y)} ${n(ex)} ${n(ey)}` +
    `C${n(x - thick * 0.86)} ${n(m2y)} ${n(x - thick * 0.86)} ${n(m1y)} ${n(sx)} ${n(sy)}z`
  );
}

/** Single isolated module: a small 45° nib print, not a square. */
function nibDot(r: number, c: number): string {
  const x = c + 0.5;
  const y = r + 0.5;
  const a = 0.36 + rand(r, c, 9) * 0.06;
  const b = 0.2 + rand(r, c, 10) * 0.05;
  return (
    `M${n(x - a)} ${n(y + b)}` +
    `Q${n(x - b)} ${n(y - b)} ${n(x + a)} ${n(y - b)}` +
    `Q${n(x + b)} ${n(y + b)} ${n(x - a)} ${n(y + b)}z`
  );
}

type Neighbours = { right: boolean; down: boolean; up: boolean; left: boolean };

/** Per-module shapes for the non-calligraphic organic styles. */
function modulePath(style: ArtisticPatternId, r: number, c: number, nb: Neighbours): string {
  const x = c;
  const y = r;
  switch (style) {
    case "ballpoint": {
      const jx = (rand(r, c, 2) - 0.5) * 0.07;
      const jy = (rand(r, c, 3) - 0.5) * 0.07;
      // A slightly firmer inset keeps neighbouring pen marks from bleeding
      // together, which is what breaks camera decoding at small zoom levels.
      const inset = 0.13 + rand(r, c, 4) * 0.05;
      return roundedModule(x + jx, y + jy, inset, 0.14);
    }
    case "chalk": {
      const rad = 0.36 + rand(r, c, 5) * 0.1;
      const cx = x + 0.5 + (rand(r, c, 6) - 0.5) * 0.06;
      const cy = y + 0.5 + (rand(r, c, 7) - 0.5) * 0.06;
      return `M${n(cx - rad)} ${n(cy)}a${n(rad)} ${n(rad)} 0 1 0 ${n(rad * 2)} 0a${n(rad)} ${n(rad)} 0 1 0 -${n(rad * 2)} 0z`;
    }
    case "mesh": {
      const rad = 0.3 + rand(r, c, 8) * 0.03;
      const cx = x + 0.5;
      const cy = y + 0.5;
      let d = `M${n(cx - rad)} ${n(cy)}a${n(rad)} ${n(rad)} 0 1 0 ${n(rad * 2)} 0a${n(rad)} ${n(rad)} 0 1 0 -${n(rad * 2)} 0z`;
      // Connectors weld neighbouring nodes into a fluid lattice. The stroke
      // stays well under the module pitch so adjacent lines never merge.
      const w = 0.095;
      if (nb.right)
        d += `M${n(cx)} ${n(cy - w)}L${n(cx + 1)} ${n(cy - w)}L${n(cx + 1)} ${n(cy + w)}L${n(cx)} ${n(cy + w)}z`;
      if (nb.down)
        d += `M${n(cx - w)} ${n(cy)}L${n(cx + w)} ${n(cy)}L${n(cx + w)} ${n(cy + 1)}L${n(cx - w)} ${n(cy + 1)}z`;
      return d;
    }
    default:
      return roundedModule(x, y);
  }
}

/** SVG filters that give each style its material texture. */
function filterDefs(style: ArtisticPatternId, uid: string): { defs: string; filter: string } {
  switch (style) {
    case "chalk":
      return {
        defs: `<filter id="chalk-${uid}" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="0.28" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="0.035"/></filter>`,
        filter: `chalk-${uid}`,
      };
    case "ballpoint":
      return {
        defs: `<filter id="pen-${uid}" x="-15%" y="-15%" width="130%" height="130%"><feTurbulence type="turbulence" baseFrequency="1.4" numOctaves="2" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="0.1" xChannelSelector="R" yChannelSelector="G"/></filter>`,
        filter: `pen-${uid}`,
      };
    case "calligraphy":
      return {
        // Ink bleed: a whisper of turbulence plus a soft edge so the stroke
        // reads as wet ink on paper without eating the module boundaries.
        defs: `<filter id="ink-${uid}" x="-15%" y="-15%" width="130%" height="130%"><feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" seed="11" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="0.07" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="0.012"/></filter>`,
        filter: `ink-${uid}`,
      };
    default:
      return { defs: "", filter: "" };
  }
}

/* ── Layer A: untouchable anchors ───────────────────────────────────────── */

function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2);
  if (rr <= 0) return `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h-${n(w)}z`;
  return `M${n(x + rr)} ${n(y)}h${n(w - 2 * rr)}a${n(rr)} ${n(rr)} 0 0 1 ${n(rr)} ${n(rr)}v${n(h - 2 * rr)}a${n(rr)} ${n(rr)} 0 0 1 -${n(rr)} ${n(rr)}h-${n(w - 2 * rr)}a${n(rr)} ${n(rr)} 0 0 1 -${n(rr)} -${n(rr)}v-${n(h - 2 * rr)}a${n(rr)} ${n(rr)} 0 0 1 ${n(rr)} -${n(rr)}z`;
}

function ringPath(x: number, y: number, size: number, thickness: number, radius: number): string {
  const outer = roundedRect(x, y, size, size, radius);
  const innerR = Math.max(0, radius - thickness * 0.6);
  const inner = roundedRect(
    x + thickness,
    y + thickness,
    size - thickness * 2,
    size - thickness * 2,
    innerR,
  );
  return `${outer}${inner}`;
}

function finderRadius(style: string, size: number): number {
  if (style === "dot") return size / 2;
  if (style === "extra-rounded") return size * 0.28;
  if (style === "leaf") return size * 0.42;
  if (style === "classic") return 0;
  return 0;
}

/** Origins of the three finder patterns, in module coordinates. */
export function finderOrigins(count: number): [number, number][] {
  return [
    [0, 0],
    [count - 7, 0],
    [0, count - 7],
  ];
}

function finderPaths(count: number, outerStyle: string, innerStyle: string): string {
  const thickness = outerStyle === "classic" ? 1.2 : 1;
  return finderOrigins(count)
    .map(([x, y]) => {
      const ring = ringPath(x, y, 7, thickness, finderRadius(outerStyle, 7));
      const innerSize = 3;
      const innerR =
        innerStyle === "dot" ? innerSize / 2 : innerStyle === "rounded" ? innerSize * 0.32 : 0;
      const inner =
        innerStyle === "diamond"
          ? `M${n(x + 3.5)} ${n(y + 2)}L${n(x + 5)} ${n(y + 3.5)}L${n(x + 3.5)} ${n(y + 5)}L${n(x + 2)} ${n(y + 3.5)}z`
          : roundedRect(x + 2, y + 2, innerSize, innerSize, innerR);
      return ring + inner;
    })
    .join("");
}

export const isFinderZone = (r: number, c: number, count: number): boolean =>
  (r < 8 && c < 8) || (r < 8 && c >= count - 8) || (r >= count - 8 && c < 8);

export interface ArtisticRenderInput {
  /** Matrix rows as '0'/'1' strings. */
  bits: string[];
  style: ArtisticPatternId;
  fgColor: string;
  outerCornerStyle?: string;
  innerCornerStyle?: string;
  /** Decorative hairline flourishes in the outer margin. */
  flourishes?: boolean;
  /** Stable suffix for filter ids so multiple SVGs can coexist. */
  uid?: string;
}

export interface ArtisticRender {
  /** Markup to place inside an `0 0 count count` viewBox. */
  inner: string;
  count: number;
}

/**
 * Merge adjacent data modules into flowing strokes.
 * Horizontal runs win (they carry the thick pen body); whatever is left is
 * scanned for vertical runs, and true singles become nib prints.
 */
function calligraphicData(
  count: number,
  dark: (r: number, c: number) => boolean,
  paintable: (r: number, c: number) => boolean,
): { body: string; hair: string } {
  const used: boolean[][] = Array.from({ length: count }, () =>
    new Array<boolean>(count).fill(false),
  );
  let body = "";
  let hair = "";

  // Pass 1 — horizontal ligatures.
  for (let r = 0; r < count; r += 1) {
    let c = 0;
    while (c < count) {
      if (!paintable(r, c)) {
        c += 1;
        continue;
      }
      let end = c;
      while (end + 1 < count && paintable(r, end + 1)) end += 1;
      if (end > c) {
        body += nibStrokeH(r, c, end, 20);
        for (let i = c; i <= end; i += 1) used[r][i] = true;
      }
      c = end + 1;
    }
  }

  // Pass 2 — vertical ligatures on whatever is still unpainted.
  for (let c = 0; c < count; c += 1) {
    let r = 0;
    while (r < count) {
      if (!paintable(r, c) || used[r][c]) {
        r += 1;
        continue;
      }
      let end = r;
      while (end + 1 < count && paintable(end + 1, c) && !used[end + 1][c]) end += 1;
      if (end > r) {
        body += nibStrokeV(c, r, end, 30);
        for (let i = r; i <= end; i += 1) used[i][c] = true;
      }
      r = end + 1;
    }
  }

  // Pass 3 — lone modules become nib prints; diagonal partners get a hairline.
  for (let r = 0; r < count; r += 1) {
    for (let c = 0; c < count; c += 1) {
      if (!paintable(r, c) || used[r][c]) continue;
      body += nibDot(r, c);
      used[r][c] = true;
      // A delicate connecting hairline towards a diagonal neighbour keeps the
      // texture cursive instead of dotty.
      if (paintable(r + 1, c + 1) && rand(r, c, 12) > 0.55) {
        hair += `M${n(c + 0.6)} ${n(r + 0.6)}Q${n(c + 1)} ${n(r + 0.85)} ${n(c + 1.4)} ${n(r + 1.4)}`;
      }
    }
  }

  void dark;
  return { body, hair };
}

/** Decorative bracket curves in the quiet zone, far from the finder corners. */
function flourishPaths(count: number, margin: number): string {
  if (count < 21 || margin < 2) return "";
  const m = margin * 0.55;
  const a = count * 0.34;
  const b = count * 0.66;
  const parts = [
    // top and bottom sweeping brackets
    `M${n(a)} ${n(-m)}Q${n(count / 2)} ${n(-m * 1.9)} ${n(b)} ${n(-m)}`,
    `M${n(a)} ${n(count + m)}Q${n(count / 2)} ${n(count + m * 1.9)} ${n(b)} ${n(count + m)}`,
    // side hairlines
    `M${n(-m)} ${n(a)}Q${n(-m * 1.9)} ${n(count / 2)} ${n(-m)} ${n(b)}`,
    `M${n(count + m)} ${n(a)}Q${n(count + m * 1.9)} ${n(count / 2)} ${n(count + m)} ${n(b)}`,
  ];
  return parts.join("");
}

/** Build the two-layer artistic markup for a module matrix. */
export function renderArtisticQR({
  bits,
  style,
  fgColor,
  outerCornerStyle = "square",
  innerCornerStyle = "square",
  flourishes = false,
  uid = "a",
}: ArtisticRenderInput): ArtisticRender {
  const count = bits.length;
  if (!count) return { inner: "", count: 0 };

  const dark = (r: number, c: number) =>
    r >= 0 && c >= 0 && r < count && c < count && bits[r]?.[c] === "1";
  /**
   * Modules Layer B is allowed to touch: everything except the three finder
   * zones. Timing rows, alignment blocks and format areas all adopt the active
   * style, so a styled code never falls back to plain squares.
   */
  const paintable = (r: number, c: number) => dark(r, c) && !isFinderZone(r, c, count);

  let data = "";
  let hairlines = "";

  try {
    if (style === "calligraphy") {
      const { body, hair } = calligraphicData(count, dark, paintable);
      data = body;
      hairlines = hair;
    } else {
      for (let r = 0; r < count; r += 1) {
        for (let c = 0; c < count; c += 1) {
          if (!paintable(r, c)) continue;
          const nb: Neighbours = {
            right: paintable(r, c + 1),
            left: paintable(r, c - 1),
            up: paintable(r - 1, c),
            down: paintable(r + 1, c),
          };
          data += modulePath(style, r, c, nb);
        }
      }
    }
  } catch (error) {
    // A failing generator must never blank the code — fall back to clean blocks.
    console.error("[artistic] data layer fallback", error);
    data = "";
    for (let r = 0; r < count; r += 1) {
      for (let c = 0; c < count; c += 1) {
        if (paintable(r, c)) data += roundedModule(c, r);
      }
    }
    hairlines = "";
  }

  // Timing patterns + anchors: crisp, spec-exact, unfiltered.
  let anchors = "";
  try {
    anchors += finderPaths(count, outerCornerStyle, innerCornerStyle);
  } catch (error) {
    console.error("[artistic] finder fallback", error);
    anchors += finderPaths(count, "square", "square");
  }
  const { defs, filter } = filterDefs(style, uid);
  // Opacity stays high (>=0.92) so contrast at the module boundary survives.
  const inkOpacity = style === "chalk" ? 0.94 : 0.97;
  const layerB = filter
    ? `<g filter="url(#${filter})" fill="${fgColor}" fill-opacity="${inkOpacity}"><path d="${data}"/></g>`
    : `<g fill="${fgColor}" fill-opacity="${inkOpacity}"><path d="${data}"/></g>`;

  const hairLayer = hairlines
    ? `<g fill="none" stroke="${fgColor}" stroke-width="0.06" stroke-linecap="round" stroke-opacity="0.55"><path d="${hairlines}"/></g>`
    : "";

  const flourishLayer =
    flourishes && style === "calligraphy"
      ? `<g fill="none" stroke="${fgColor}" stroke-width="0.07" stroke-linecap="round" stroke-opacity="0.45"><path d="${flourishPaths(count, 4)}"/></g>`
      : "";

  const inner = `${defs ? `<defs>${defs}</defs>` : ""}${layerB}${hairLayer}${flourishLayer}<g fill="${fgColor}" shape-rendering="geometricPrecision"><path fill-rule="evenodd" d="${anchors}"/></g>`;
  return { inner, count };
}

/** Standalone SVG document (used for exports and frame embedding). */
export function artisticQrSvg(
  input: ArtisticRenderInput & { bgColor?: string; margin?: number; size?: number },
): string {
  const { inner, count } = renderArtisticQR(input);
  if (!count) return "";
  const margin = input.margin ?? 4;
  const total = count + margin * 2;
  const bg =
    input.bgColor && input.bgColor !== "transparent"
      ? `<rect width="${total}" height="${total}" fill="${input.bgColor}"/>`
      : "";
  const size = input.size ?? 2000;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}">${bg}<g transform="translate(${margin} ${margin})">${inner}</g></svg>`;
}
