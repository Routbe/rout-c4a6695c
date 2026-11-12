/**
 * Minimalist symbol used to preview a theme: the three outer "finder" markers
 * every QR code has (top-left, top-right, bottom-left squares-in-squares).
 * Replaces the busy mini-QR module grid that used to fill theme cards.
 */
export function FinderMarkGlyph({
  fgColor,
  bg,
  className,
}: {
  fgColor: string;
  bg: string;
  className?: string;
}) {
  const finder = (x: number, y: number) => (
    <g transform={`translate(${x} ${y})`}>
      <rect
        x={0}
        y={0}
        width={7}
        height={7}
        rx={1.5}
        fill="none"
        stroke={fgColor}
        strokeWidth={1.4}
      />
      <rect x={2.2} y={2.2} width={2.6} height={2.6} rx={0.6} fill={fgColor} />
    </g>
  );

  return (
    <span className={className} style={{ background: bg }} aria-hidden>
      <svg viewBox="0 0 24 24" width="100%" height="100%" role="presentation">
        {finder(1, 1)}
        {finder(16, 1)}
        {finder(1, 16)}
      </svg>
    </span>
  );
}
