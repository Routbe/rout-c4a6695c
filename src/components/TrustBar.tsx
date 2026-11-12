import { Link } from "@/lib/router-compat";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** Factual, verifiable claims — no marketing superlatives. */
export const TRUST_BADGES: { id: string; label: string; detail: string; tooltip: string }[] = [
  {
    id: "client-side",
    label: "100% Client-Side Engine",
    detail: "Static QR generation runs entirely in your browser. Payloads never reach a server.",
    tooltip: "QR codes are drawn locally in your browser. No data ever reaches a server.",
  },
  {
    id: "eea",
    label: "EEA Infrastructure",
    detail: "Databases, backups and routing proxies stay inside the European Economic Area.",
    tooltip: "Hosted strictly on European server nodes compliant with EU privacy laws.",
  },
  {
    id: "gdpr",
    label: "GDPR Compliant",
    detail:
      "Data minimisation by design, with enforceable data subject rights under Belgian GBA/APD oversight.",
    tooltip: "Data minimisation by design, with enforceable data subject rights under EU law.",
  },
  {
    id: "agpl",
    label: "AGPLv3 (Network Copyleft)",
    detail: "The full source is auditable and self-hostable under AGPL-3.0-or-later.",
    tooltip: "Audit, fork or self-host under AGPL-3.0-or-later; modified network services must offer their corresponding source to users.",
  },
  {
    id: "no-trackers",
    label: "Zero Trackers",
    detail: "No advertising cookies, no fingerprinting, no third-party analytics scripts.",
    tooltip: "No advertising pixels, profiling cookies, or analytics tracking.",
  },
];

/** Horizontal badge row under the hero; every pill deep-links to /sovereignty. */
export function TrustBar({ className }: { className?: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <nav
        aria-label="Sovereignty guarantees"
        className={cn(
          "flex w-full flex-wrap items-center justify-center gap-2 border-t border-border/60 px-4 py-4",
          className,
        )}
      >
        {TRUST_BADGES.map((b) => (
          <Tooltip key={b.id}>
            <TooltipTrigger asChild>
              <Link
                to={`/sovereignty#${b.id}`}
                aria-describedby={`trust-${b.id}-desc`}
                className="inline-flex min-h-11 items-center rounded-full border border-border bg-background px-3 py-1.5 font-mono text-[11px] tracking-wide text-muted-foreground transition-colors hover:border-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {b.label}
                {/* Touch devices never hover: keep the explanation reachable for
                    assistive tech regardless of the tooltip. */}
                <span id={`trust-${b.id}-desc`} className="sr-only">
                  {b.tooltip}
                </span>
              </Link>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              sideOffset={8}
              collisionPadding={12}
              className="max-w-[15rem] text-xs leading-relaxed"
            >
              {b.tooltip}
            </TooltipContent>
          </Tooltip>
        ))}
      </nav>
    </TooltipProvider>
  );
}
