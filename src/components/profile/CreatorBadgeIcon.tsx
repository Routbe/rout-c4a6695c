import { useId } from "react";

/**
 * Roze creatorbadge: geschulpte zegel met vinkje, voor leden met minstens
 * 10.000 volgers via gekoppelde accounts. Vaste merkkleur (geen thema-token):
 * het teken moet overal identiek ogen. Lichte rand houdt het zichtbaar op donker.
 */
export function CreatorBadgeIcon({ className = "h-5 w-5" }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const pts: string[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (Math.PI * 2 * i) / 24 - Math.PI / 2;
    const r = i % 2 === 0 ? 11 : 9.4;
    pts.push(`${(12 + r * Math.cos(a)).toFixed(2)},${(12 + r * Math.sin(a)).toFixed(2)}`);
  }
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-hidden focusable="false">
      <defs>
        <linearGradient id={`rout-creator-g-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff6fb5" />
          <stop offset="1" stopColor="#d6197a" />
        </linearGradient>
      </defs>
      <polygon points={pts.join(" ")} fill={`url(#rout-creator-g-${uid})`} stroke="#ffffff" strokeOpacity="0.6" strokeWidth="0.8" strokeLinejoin="round" />
      <path d="M7.6 12.3l3 3 5.8-6.2" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="17.6" cy="6.6" r="1" fill="#ffffff" fillOpacity="0.85" />
    </svg>
  );
}
