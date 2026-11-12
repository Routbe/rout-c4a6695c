/** Officieel Infomaniak-merkteken: witte "k" op het kenmerkende blauw. */
export function InfomaniakMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="1" y="1" width="22" height="22" rx="4.5" fill="#0098FF" />
      <path d="M7 3.2h3.8v8.6l4.6-4.6h4.7l-5.2 5 5.3 7.4h-4.5l-3.6-5.3-1.3 1.2v4.1H7V3.2Z" fill="#FFFFFF" />
    </svg>
  );
}
