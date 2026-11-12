import { DotMatrix, SealFrame, type BadgeProps } from "./seal-primitives";

/** European infrastructure shield over a 3x3 server node grid. */
export function EeaSeal(props: BadgeProps) {
  return (
    <SealFrame arcText="EEA SOVEREIGN HOSTING • EU DATA" arcTextId="seal-eea-arc" {...props}>
      <path
        d="M60 30 L84 39 V60 c0 15-11 23-24 28 -13-5-24-13-24-28 V39 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
      {/* Continental contour hint */}
      <path
        d="M46 50 q7-6 14-3 t13 1"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      <DotMatrix cx={60} cy={63} size={3} />
      <g
        stroke="var(--primary)"
        strokeOpacity="0.45"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      >
        <line x1="49" y1="63" x2="71" y2="63" />
        <line x1="60" y1="52" x2="60" y2="74" />
      </g>
    </SealFrame>
  );
}
