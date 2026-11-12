/**
 * Early Believer emblem: an open hand carrying a growing sprout inside a ring.
 * Stroke-only vector so it takes the surrounding text color; the gold ring accent
 * uses the `--pioneer` token when present.
 */
export function PioneerEmblem({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <circle cx="24" cy="24" r="22" stroke="var(--pioneer, currentColor)" strokeWidth="2" />
      <circle cx="24" cy="24" r="18.5" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1" />
      {/* sprout stem */}
      <path d="M24 28.5V17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* left leaf */}
      <path d="M24 20.5c-1-3.6-3.9-5.6-7.6-5.4.2 3.6 3.2 6.1 7.6 5.4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      {/* right leaf */}
      <path d="M24 17.6c.8-4 3.9-6.3 8-6.1-.1 4-3.4 6.7-8 6.1z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      {/* soil mound */}
      <path d="M19.5 28.8c1.3-1.2 2.8-1.8 4.5-1.8s3.2.6 4.5 1.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      {/* open hand: palm + thumb + fingers */}
      <path
        d="M10.5 31.5l4.2-1.6c1.5-.6 3.1-.6 4.6 0l3.5 1.3h4.4c1 0 1.8.8 1.8 1.8s-.8 1.8-1.8 1.8h-5.4M24.2 34.8l7.6-3.4c1.1-.5 2.4-.1 3 .9.6 1 .3 2.3-.6 3l-6.6 4.6c-1.3.9-2.9 1.3-4.5 1.1l-6.2-.8-3.6 1.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
