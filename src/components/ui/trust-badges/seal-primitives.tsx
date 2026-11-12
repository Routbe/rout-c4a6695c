import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

export type BadgeProps = SVGProps<SVGSVGElement>;

/** Precomputed so SSR and client emit byte-identical attributes. */
const TICKS = [
  { x1: 104.0, y1: 60.0, x2: 108.0, y2: 60.0 },
  { x1: 98.11, y1: 82.0, x2: 101.57, y2: 84.0 },
  { x1: 82.0, y1: 98.11, x2: 84.0, y2: 101.57 },
  { x1: 60.0, y1: 104.0, x2: 60.0, y2: 108.0 },
  { x1: 38.0, y1: 98.11, x2: 36.0, y2: 101.57 },
  { x1: 21.89, y1: 82.0, x2: 18.43, y2: 84.0 },
  { x1: 16.0, y1: 60.0, x2: 12.0, y2: 60.0 },
  { x1: 21.89, y1: 38.0, x2: 18.43, y2: 36.0 },
  { x1: 38.0, y1: 21.89, x2: 36.0, y2: 18.43 },
  { x1: 60.0, y1: 16.0, x2: 60.0, y2: 12.0 },
  { x1: 82.0, y1: 21.89, x2: 84.0, y2: 18.43 },
  { x1: 98.11, y1: 38.0, x2: 101.57, y2: 36.0 },
] as const;

/**
 * Shared chrome for every sovereignty seal.
 *
 * All geometry is expressed in a 120x120 user space and every stroke uses
 * `vectorEffect="non-scaling-stroke"` so the linework stays hairline-crisp at
 * any rendered size. Colours resolve from theme tokens (`currentColor`,
 * `--primary`, `--border`, `--muted-foreground`) so the seals invert cleanly
 * between light and dark themes.
 */
export function SealFrame({
  children,
  arcText,
  arcTextId,
  className,
  ...rest
}: BadgeProps & { arcText: string; arcTextId: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      // Decorative: every seal is rendered inside a control or heading that
      // already carries the accessible name.
      aria-hidden
      className={cn("size-24 text-foreground", className)}
      {...rest}
    >
      <defs>
        {/* Upper perimeter baseline, so the arc lettering always reads upright. */}
        <path id={arcTextId} d="M9 60 A51 51 0 0 1 111 60" fill="none" />
      </defs>

      {/* Double ring */}
      <circle
        cx="60"
        cy="60"
        r="58"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx="60"
        cy="60"
        r="40"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />

      {/* Geometric tick marks every 30 degrees. */}
      <g
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      >
        {TICKS.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} />
        ))}
      </g>

      <text
        fill="var(--muted-foreground)"
        fontSize="7.5"
        letterSpacing="1.1"
        fontFamily="ui-monospace, monospace"
      >
        <textPath href={`#${arcTextId}`} startOffset="50%" textAnchor="middle">
          {arcText}
        </textPath>
      </text>

      {children}
    </svg>
  );
}

/** Subtle dot-matrix used as a technical texture inside a few seals. */
export function DotMatrix({ cx, cy, size = 3 }: { cx: number; cy: number; size?: number }) {
  const dots: React.ReactElement[] = [];
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      dots.push(
        <circle
          key={`${x}-${y}`}
          cx={cx + (x - (size - 1) / 2) * 7}
          cy={cy + (y - (size - 1) / 2) * 7}
          r="1.4"
          fill="var(--primary)"
          fillOpacity="0.7"
        />,
      );
    }
  }
  return <g>{dots}</g>;
}
