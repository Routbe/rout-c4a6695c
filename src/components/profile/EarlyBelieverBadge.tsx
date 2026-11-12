import { useTranslation } from "react-i18next";
/**
 * Fleur-de-lis embleem voor Early Believers — de leden die er vanaf het
 * begin bij waren. Getekend als SVG zodat hij in elke themakleur meekleurt.
 */
export function FleurDeLisIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" className={className} aria-hidden>
      {/* middelste lelie */}
      <path d="M12 1.2c-1.9 2.6-2.9 4.9-2.9 6.9 0 1.7.9 3.2 1.9 4.2l-1 .6h4l-1-.6c1-1 1.9-2.5 1.9-4.2 0-2-1-4.3-2.9-6.9z" />
      {/* linker lelie */}
      <path d="M7.6 7.4c-2.5-.4-4.6 1-5 3.1-.3 1.9.9 3.5 2.6 3.9-.3.3-.5.8-.5 1.2 0 1 .8 1.7 1.8 1.7 1.2 0 2.1-1 2.1-2.3 0-.6-.2-1.2-.6-1.7h1.4c-.6-2-1-4.3-1.8-5.9z" />
      {/* rechter lelie */}
      <path d="M16.4 7.4c2.5-.4 4.6 1 5 3.1.3 1.9-.9 3.5-2.6 3.9.3.3.5.8.5 1.2 0 1-.8 1.7-1.8 1.7-1.2 0-2.1-1-2.1-2.3 0-.6.2-1.2.6-1.7h-1.4c.6-2 1-4.3 1.8-5.9z" />
      {/* band */}
      <rect x="8.6" y="13.1" width="6.8" height="1.7" rx="0.85" />
      {/* voet */}
      <path d="M12 15.6c-.9 1.5-1.7 2.2-2.9 2.6.9.3 1.7.9 2.1 1.7.2.5.5 1.6.8 2.9.3-1.3.6-2.4.8-2.9.4-.8 1.2-1.4 2.1-1.7-1.2-.4-2-1.1-2.9-2.6z" />
    </svg>
  );
}

/**
 * Early Believer badge: fleur-de-lis + label. De knop opent de
 * verificatie-uitleg (onClick wordt door ProfileView doorgegeven).
 */
export function EarlyBelieverBadge({
  onClick,
  borderColor,
  textColor,
}: {
  onClick?: () => void;
  borderColor?: string;
  textColor?: string;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest transition-opacity hover:opacity-80"
      style={{
        border: `1px solid ${borderColor ?? "currentColor"}`,
        color: textColor,
      }}
    >
      <FleurDeLisIcon className="h-3.5 w-3.5" aria-hidden />  {t("badges.earlyBelieverLabel")} </button>
  );
}
