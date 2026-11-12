import { useId } from "react";

/**
 * Bedrijfsbadge: donker schild met gouden rand en vinkje — bewijst een
 * geverifieerd bedrijf (btw + domein via de DNS-zone). Vaste merkkleuren; de
 * lichte buitenrand houdt het zichtbaar op een zwarte achtergrond.
 */
export function DomainBadgeIcon({ className = "h-5 w-5" }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-hidden focusable="false">
      <defs>
        <linearGradient id={`rout-biz-g-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a2d34" />
          <stop offset="1" stopColor="#0b0b0c" />
        </linearGradient>
        <linearGradient id={`rout-biz-gold-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f5d78a" />
          <stop offset="1" stopColor="#b8892f" />
        </linearGradient>
      </defs>
      <path
        d="M12 1.6l8.4 3.1v6.4c0 5.2-3.6 9.4-8.4 11.3C7.2 20.5 3.6 16.3 3.6 11.1V4.7z"
        fill={`url(#rout-biz-g-${uid})`}
        stroke="#ffffff"
        strokeOpacity="0.55"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      <path
        d="M12 3.4l6.7 2.5v5.2c0 4.2-2.8 7.6-6.7 9.2-3.9-1.6-6.7-5-6.7-9.2V5.9z"
        fill="none"
        stroke={`url(#rout-biz-gold-${uid})`}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M8.3 11.8l2.6 2.6 4.9-5.2" fill="none" stroke={`url(#rout-biz-gold-${uid})`} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
