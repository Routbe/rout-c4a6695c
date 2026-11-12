import { SealFrame, type BadgeProps } from "./seal-primitives";

/** OSI keyhole geometry plus AGPL vector lettering. */
export function AgplSeal(props: BadgeProps) {
  return (
    <SealFrame arcText="AGPL-3.0 • FREE SOFTWARE" arcTextId="seal-agpl-arc" {...props}>
      {/* Architectural diamond frame */}
      <polygon
        points="60,26 94,60 60,94 26,60"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.4"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />

      {/* OSI keyhole: open ring with a downward stem */}
      <path
        d="M60 36 a13 13 0 1 0 -6.5 24.3 L53.5 74 h13 l0-13.7 A13 13 0 0 0 60 36 Z"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx="60"
        cy="49"
        r="4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        vectorEffect="non-scaling-stroke"
      />

      <text
        x="60"
        y="86"
        textAnchor="middle"
        fill="currentColor"
        fontSize="10"
        letterSpacing="0.8"
        fontFamily="ui-monospace, monospace"
      >
        AGPLv3
      </text>
    </SealFrame>
  );
}
