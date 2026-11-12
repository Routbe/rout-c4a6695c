import type { CSSProperties } from "react";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { SelectionIndicator } from "./SelectionIndicator";
import { PickerAnnouncer } from "./PickerAnnouncer";

import { useRovingRadioGroup } from "@/hooks/useRovingRadioGroup";
import { ARTISTIC_PATTERNS, type ArtisticPatternId } from "@/lib/artistic-patterns";

import { brandAsset } from "@/lib/site";

const patternSquare = brandAsset("/img/pattern-square.svg");
const patternDots = brandAsset("/img/pattern-dots.svg");
const patternRounded = brandAsset("/img/pattern-rounded.svg");
const patternDiamond = brandAsset("/img/pattern-diamond.svg");
const patternClassy = brandAsset("/img/pattern-classy.svg");

export type BodyShape = "square" | "dots" | "rounded" | "classy" | "sharp" | ArtisticPatternId;

type PatternItem = { id: BodyShape; label: string; hint: string; icon?: string };

/**
 * Single source of truth for every selectable pattern — the compact summary
 * and the Customize-shapes sheet both read from this list.
 */
export const PATTERNS: PatternItem[] = [
  { id: "square", label: "Square", hint: "Sharp classic modules", icon: patternSquare },
  { id: "dots", label: "Dots", hint: "Round modules", icon: patternDots },
  { id: "rounded", label: "Rounded", hint: "Softened corners", icon: patternRounded },
  { id: "sharp", label: "Diamond", hint: "Angular facets", icon: patternDiamond },
  { id: "classy", label: "Classy", hint: "Leaf-cut corners", icon: patternClassy },
  ...ARTISTIC_PATTERNS.map((p) => ({ id: p.id as BodyShape, label: p.label, hint: p.hint })),
];

/**
 * Mini QR illustration used as the thumbnail for every geometric pattern.
 *
 * Drawn inline instead of masking a remote SVG: cross-origin mask images are
 * subject to CORS and silently fail, which is why these tiles rendered empty.
 */
const GLYPH_MATRIX = [
  [1, 1, 1, 0, 1, 0, 1],
  [1, 0, 1, 0, 0, 1, 1],
  [1, 1, 1, 0, 1, 0, 0],
  [0, 0, 0, 1, 0, 1, 1],
  [1, 1, 0, 1, 1, 1, 0],
  [0, 1, 1, 0, 0, 1, 0],
  [1, 0, 1, 1, 1, 0, 1],
];

function glyphModule(shape: BodyShape, x: number, y: number) {
  const k = `${x}-${y}`;
  switch (shape) {
    case "dots":
      return <circle key={k} cx={x + 0.5} cy={y + 0.5} r={0.45} />;
    case "rounded":
      return <rect key={k} x={x + 0.05} y={y + 0.05} width={0.9} height={0.9} rx={0.34} />;
    case "sharp":
      return (
        <polygon
          key={k}
          points={`${x + 0.5},${y + 0.02} ${x + 0.98},${y + 0.5} ${x + 0.5},${y + 0.98} ${x + 0.02},${y + 0.5}`}
        />
      );
    case "classy":
      return (
        <path
          key={k}
          d={`M${x + 0.42} ${y}H${x + 1}V${y + 0.58}A${0.42} ${0.42} 0 0 1 ${x + 0.58} ${y + 1}H${x}V${y + 0.42}A${0.42} ${0.42} 0 0 1 ${x + 0.42} ${y}Z`}
        />
      );
    default:
      return <rect key={k} x={x} y={y} width={1} height={1} />;
  }
}

/** Bare mini-QR illustration in the given module shape. */
export function MiniQrGlyph({
  shape = "square",
  className,
  style,
}: {
  shape?: BodyShape;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 7 7"
      role="img"
      aria-hidden="true"
      className={className}
      style={style}
      fill="currentColor"
    >
      {GLYPH_MATRIX.flatMap((row, y) =>
        row.map((on, x) => (on ? glyphModule(shape, x, y) : null)).filter(Boolean),
      )}
    </svg>
  );
}

/** Small themed thumbnail for one pattern. */
export function PatternGlyph({ pattern }: { pattern: PatternItem }) {
  if (!pattern.icon) return <ArtisticGlyph id={pattern.id as ArtisticPatternId} />;
  return (
    <svg
      viewBox="0 0 7 7"
      role="img"
      aria-hidden="true"
      className="h-full w-full"
      fill="currentColor"
    >
      {GLYPH_MATRIX.flatMap((row, y) =>
        row.map((on, x) => (on ? glyphModule(pattern.id, x, y) : null)).filter(Boolean),
      )}
    </svg>
  );
}

/**
 * Compact pattern summary: shows the active style and opens the shape studio.
 * Replaces the old oversized 3×3 selection grid.
 */
export function BodyShapeSelector({
  selectedShape,
  onCustomize,
}: {
  selectedShape: BodyShape;
  onCustomize: () => void;
}) {
  const active = PATTERNS.find((p) => p.id === selectedShape) ?? PATTERNS[0];
  return (
    <div
      data-testid="pattern-summary"
      className="flex items-center gap-3 rounded-2xl border border-border bg-background px-3 py-2.5"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/70 p-1.5">
        <PatternGlyph pattern={active} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{active.label}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{active.hint}</span>
      </span>
      <button
        type="button"
        data-testid="customize-shapes-trigger"
        onClick={onCustomize}
        className="ml-auto inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
        Customize shapes
      </button>
    </div>
  );
}

/**
 * Horizontal 1-tap pattern strip. Tapping a tile changes the live QR straight
 * away; the trailing card opens the full shape studio for advanced axes.
 */
/** Primary patterns offered as 1-tap tiles; the rest lives in the studio sheet. */
const QUICK_PATTERN_IDS: BodyShape[] = [
  "square",
  "dots",
  "rounded",
  "mesh",
  "calligraphy",
  "ballpoint",
  "chalk",
];

/**
 * Horizontal 1-tap pattern strip. Tapping a tile updates the live QR straight
 * away; the trailing card opens the shape studio for the advanced axes.
 */
export function PatternPresetRow({
  selectedShape,
  onSelect,
  onCustomize,
}: {
  selectedShape: BodyShape;
  onSelect: (shape: BodyShape) => void;
  onCustomize: () => void;
}) {
  const quick = QUICK_PATTERN_IDS.map((id) => PATTERNS.find((p) => p.id === id) ?? PATTERNS[0]);
  const group = useRovingRadioGroup<HTMLDivElement>();
  const activeLabel = quick.find((p) => p.id === selectedShape)?.label;
  return (
    <>
      <PickerAnnouncer message={activeLabel ? `${activeLabel} pattern selected` : ""} />
      <div
        data-testid="pattern-preset-row"
        role="radiogroup"
        aria-label="QR pattern"
        tabIndex={-1}
        ref={group.ref}
        onKeyDown={group.onKeyDown}
        /* Mobile: swipeable row. Desktop: balanced 2 x 4 grid. */
        className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-visible px-1.5 pb-2 pt-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:grid md:grid-cols-4 md:gap-2 md:overflow-visible"
      >
        {quick.map((pattern) => {
          const active = pattern.id === selectedShape;
          return (
            <button
              key={pattern.id}
              type="button"
              data-testid={`pattern-tile-${pattern.id}`}
              role="radio"
              aria-checked={active}
              aria-label={pattern.label}
              tabIndex={active ? 0 : -1}
              onClick={() => onSelect(pattern.id)}
              className={cn(
                "relative flex min-h-11 w-[22%] min-w-[72px] shrink-0 snap-start flex-col items-center gap-1 overflow-visible rounded-2xl border-2 p-1.5 md:w-full md:min-w-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:p-1",
                active
                  ? "border-foreground bg-muted/60"
                  : "border-border bg-background hover:bg-muted/40",
              )}
            >
              <SelectionIndicator visible={active} />

              <span className="flex h-6 w-6 items-center justify-center text-foreground">
                <PatternGlyph pattern={pattern} />
              </span>
              <span className="w-full truncate text-center text-[10px] leading-tight text-muted-foreground">
                {pattern.label}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          data-testid="customize-shapes-trigger"
          onClick={onCustomize}
          className="flex min-h-11 w-[22%] min-w-[72px] shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed md:w-full md:min-w-0 border-border bg-background p-1.5 transition-colors duration-150 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:p-1"
        >
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="w-full truncate text-center text-[10px] leading-tight text-muted-foreground">
            Fine-tune
          </span>
        </button>
      </div>
    </>
  );
}

/** Tiny preview glyph per artistic style, drawn in the current fg colour. */
function ArtisticGlyph({ id }: { id: ArtisticPatternId }) {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full fill-foreground" aria-hidden>
      {id === "calligraphy" && (
        <>
          <path d="M2 8 Q7 4 12 8 Q7 12 2 8z" />
          <path d="M13 16 Q18 12 23 16 Q18 20 13 16z" />
          <path d="M14 4 Q19 6 20 10 Q15 9 14 4z" />
        </>
      )}
      {id === "ballpoint" && (
        <>
          <rect x="2" y="3" width="7" height="7" rx="1.5" />
          <rect x="12" y="5" width="6" height="6" rx="1.5" />
          <rect x="4" y="14" width="6" height="6" rx="1.5" />
          <rect x="14" y="15" width="7" height="6" rx="1.5" />
        </>
      )}
      {id === "chalk" && (
        <>
          <circle cx="6" cy="7" r="3.6" opacity="0.85" />
          <circle cx="16" cy="6" r="3" opacity="0.7" />
          <circle cx="8" cy="17" r="3.2" opacity="0.75" />
          <circle cx="17" cy="16" r="3.8" opacity="0.9" />
        </>
      )}
      {id === "mesh" && (
        <>
          <circle cx="6" cy="6" r="2.6" />
          <circle cx="18" cy="6" r="2.6" />
          <circle cx="6" cy="18" r="2.6" />
          <circle cx="18" cy="18" r="2.6" />
          <rect x="6" y="5" width="12" height="2" />
          <rect x="5" y="6" width="2" height="12" />
          <rect x="17" y="6" width="2" height="12" />
        </>
      )}
    </svg>
  );
}
