import { SealFrame, type BadgeProps } from "./seal-primitives";

/** EU 12-star circle + centred shield/padlock. */
export function GdprSeal(props: BadgeProps) {
  return (
    <SealFrame arcText="GDPR / AVG COMPLIANT • VERIFIED" arcTextId="seal-gdpr-arc" {...props}>
      <g fill="var(--primary)" fillOpacity="0.85">
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i * Math.PI) / 6 - Math.PI / 2;
          const cx = 60 + 31 * Math.cos(a);
          const cy = 60 + 31 * Math.sin(a);
          const pts = Array.from({ length: 10 }).map((__, k) => {
            const r = k % 2 === 0 ? 3 : 1.25;
            const sa = (k * Math.PI) / 5 - Math.PI / 2;
            return `${(cx + r * Math.cos(sa)).toFixed(2)},${(cy + r * Math.sin(sa)).toFixed(2)}`;
          });
          return <polygon key={i} points={pts.join(" ")} />;
        })}
      </g>

      <path
        d="M60 38 L78 45 V62 c0 12-9 18-18 22 -9-4-18-10-18-22 V45 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M54 62 v-5 a6 6 0 0 1 12 0 v5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
      <rect
        x="52"
        y="62"
        width="16"
        height="13"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </SealFrame>
  );
}
