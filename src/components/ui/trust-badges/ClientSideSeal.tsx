import { DotMatrix, SealFrame, type BadgeProps } from "./seal-primitives";

/** Octagonal browser sandbox with a CPU die and a centre lock. */
export function ClientSideSeal(props: BadgeProps) {
  const oct = Array.from({ length: 8 })
    .map((_, i) => {
      const a = (i * Math.PI) / 4 + Math.PI / 8;
      return `${(60 + 34 * Math.cos(a)).toFixed(2)},${(60 + 34 * Math.sin(a)).toFixed(2)}`;
    })
    .join(" ");

  return (
    <SealFrame
      arcText="100% CLIENT-SIDE • ZERO-KNOWLEDGE ENGINE"
      arcTextId="seal-client-arc"
      {...props}
    >
      <polygon
        points={oct}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />

      {/* CPU die with circuit legs */}
      <rect
        x="46"
        y="46"
        width="28"
        height="28"
        rx="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
      <g stroke="var(--primary)" strokeWidth="1" vectorEffect="non-scaling-stroke">
        {[52, 60, 68].map((p) => (
          <g key={p}>
            <line x1={p} y1="40" x2={p} y2="46" />
            <line x1={p} y1="74" x2={p} y2="80" />
            <line x1="40" y1={p} x2="46" y2={p} />
            <line x1="74" y1={p} x2="80" y2={p} />
          </g>
        ))}
      </g>
      <DotMatrix cx={60} cy={60} size={3} />

      <rect
        x="55"
        y="57"
        width="10"
        height="8"
        rx="1.5"
        fill="var(--card)"
        stroke="currentColor"
        strokeWidth="1.2"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M57 57 v-2.5 a3 3 0 0 1 6 0 V57"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        vectorEffect="non-scaling-stroke"
      />
    </SealFrame>
  );
}
