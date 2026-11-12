import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface TrustBadge {
  id: string;
  label: string;
  tooltip: string;
  /** Tailwind class that lights the icon up in its brand-themed colour on hover. */
  accent: string;
  icon: ReactNode;
  /** Optional external proof (only used for the open-source seal). */
  href?: string;
}

/**
 * Vertrouwensbalk: uitsluitend architecturale en open-source zegels.
 *
 * Bewust géén ISO-, SOC- of NIS2-claims: die vereisen een externe audit. Elk
 * zegel hier is technisch controleerbaar in de broncode of in het netwerk.
 */
const BADGES: TrustBadge[] = [
  {
    id: "agpl",
    label: "AGPLv3 (Netwerk-Copyleft)",
    tooltip: "Controleer, fork of host ROUT onder AGPL-3.0-or-later. Gewijzigde netwerkdiensten moeten gebruikers de bijbehorende broncode aanbieden.",
    accent: "group-hover:text-violet-600 dark:group-hover:text-purple-400",
    href: "https://github.com/Routbe",
    icon: (
      <>
        <path d="M4 4H2v16h2" />
        <path d="M20 4h2v16h-2" />
        <path d="M8.5 16V9.5" />
        <path d="M8.5 9.5h2.2a1.8 1.8 0 0 1 0 3.6H8.5" />
        <path d="M15.5 16v-6.5h2.4" />
      </>
    ),
  },
  {
    id: "client-side",
    label: "Client-Side Engine",
    tooltip:
      "Statische QR-codes worden volledig in je browser berekend. De inhoud bereikt nooit een server.",
    accent: "group-hover:text-sky-600 dark:group-hover:text-sky-400",
    icon: (
      <>
        <rect x="2" y="4" width="20" height="13" rx="2" />
        <path d="M8 21h8" />
        <path d="M12 17v4" />
        <path d="m9 8-2 2.5L9 13" />
        <path d="m15 8 2 2.5L15 13" />
      </>
    ),
  },
  {
    id: "eea",
    label: "EEA Data Residency",
    tooltip: "Databanken, back-ups en routering blijven binnen de Europese Economische Ruimte.",
    accent: "group-hover:text-emerald-600 dark:group-hover:text-emerald-400",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" />
      </>
    ),
  },
  {
    id: "no-trackers",
    label: "Zero Trackers & Cookie-Free",
    tooltip: "Geen volgcookies, advertentiepixels of profilering. Geen externe analysescripts.",
    accent: "group-hover:text-red-500 dark:group-hover:text-red-400",
    icon: (
      <>
        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
        <path d="M10.73 5.08A10.4 10.4 0 0 1 12 5c5.5 0 9 5.5 9 7a12.4 12.4 0 0 1-1.67 2.68" />
        <path d="M6.61 6.61A13.5 13.5 0 0 0 3 12c0 1.5 3.5 7 9 7a10.1 10.1 0 0 0 5.39-1.61" />
        <path d="M3 3l18 18" />
      </>
    ),
  },
  {
    id: "tls",
    label: "256-Bit TLS Encrypted",
    tooltip: "Alle verbindingen en gegevens worden versleuteld overgedragen.",
    accent: "group-hover:text-amber-600 dark:group-hover:text-amber-400",
    icon: (
      <>
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </>
    ),
  },
];

const PILL =
  "group flex min-h-11 select-none items-center gap-2.5 rounded-xl border border-border/60 bg-background px-3.5 py-2 transition-colors duration-200 hover:border-foreground/30 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function TrustBadgesBar({ className }: { className?: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <nav
        aria-label="Vertrouwensgaranties"
        className={cn("mx-auto w-full max-w-7xl px-4 py-2", className)}
      >
        <ul className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-border/70 bg-card/60 p-4 text-xs backdrop-blur-md">
          {BADGES.map((badge) => {
            const inner = (
              <>
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-colors duration-200",
                    badge.accent,
                  )}
                >
                  {badge.icon}
                </svg>
                <span className="font-medium tracking-wide text-muted-foreground transition-colors duration-200 group-hover:text-foreground">
                  {badge.label}
                </span>
              </>
            );

            return (
              <li key={badge.id}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    {badge.href ? (
                      <a
                        href={badge.href}
                        target="_blank"
                        rel="noreferrer noopener"
                        title={badge.tooltip}
                        className={PILL}
                      >
                        {inner}
                      </a>
                    ) : (
                      <button type="button" title={badge.tooltip} className={cn(PILL, "cursor-help")}>
                        {inner}
                      </button>
                    )}
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[16rem] text-xs">
                    {badge.tooltip}
                  </TooltipContent>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      </nav>
    </TooltipProvider>
  );
}

export default TrustBadgesBar;
