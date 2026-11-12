/**
 * Mens-symbool: een hand die een gekarteld keurmerk draagt.
 *
 * Staat op het alias-profiel (`rout.be/u/…`) van iemand die elders een
 * geverifieerd account heeft: bewijs dat dit account aan een geverifieerd,
 * menselijk account gekoppeld is — zonder de wettelijke naam te tonen.
 */
export function HumanLinkedIcon({ className }: { className?: string }) {
  // 16 punten op een cirkel geven de gekartelde rand van het keurmerk.
  const points = Array.from({ length: 32 }, (_, i) => {
    const angle = (i / 32) * Math.PI * 2;
    const radius = i % 2 === 0 ? 7.6 : 6.6;
    return `${(12 + Math.cos(angle) * radius).toFixed(2)},${(9 + Math.sin(angle) * radius).toFixed(2)}`;
  }).join(" ");

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <polygon points={points} />
      <circle cx="12" cy="9" r="4.4" />
      <path d="M10 9.2l1.5 1.6L14.2 7.6" />
      <path d="M2.6 18.4l2-2.4 3 2.6-2 2.4z" />
      <path d="M7.2 16.2c1.4-1.3 2.7-1.9 4-1.9h2.4a1.3 1.3 0 0 1 0 2.6h-2.6" />
      <path d="M8.6 19.6h4.6c2.5 0 5.3-1.9 7.6-3.9a1.3 1.3 0 0 0-1.6-2c-1.6 1-3 1.7-4.2 2.2" />
    </svg>
  );
}
