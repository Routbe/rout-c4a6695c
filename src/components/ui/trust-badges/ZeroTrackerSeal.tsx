import { SealFrame, type BadgeProps } from "./seal-primitives";

/** Privacy shield with a crossed-out tracking eye. */
export function ZeroTrackerSeal(props: BadgeProps) {
  return (
    <SealFrame arcText="ZERO TRACKERS • PRIVACY FIRST" arcTextId="seal-zero-arc" {...props}>
      <path
        d="M60 30 L84 39 V60 c0 15-11 23-24 28 -13-5-24-13-24-28 V39 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M45 60 q15-14 30 0 q-15 14-30 0 Z"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.8"
        strokeWidth="1.4"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx="60"
        cy="60"
        r="4.5"
        fill="none"
        stroke="var(--muted-foreground)"
        strokeWidth="1.2"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1="44"
        y1="74"
        x2="76"
        y2="46"
        stroke="var(--primary)"
        strokeWidth="2"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </SealFrame>
  );
}
