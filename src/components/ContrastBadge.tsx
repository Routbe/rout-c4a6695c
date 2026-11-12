import { useMemo } from "react";
import { Wand2, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { cn } from "@/lib/utils";
import { evaluateContrast, autoFixContrast } from "@/lib/wcag";

interface ContrastBadgeProps {
  fgColor: string;
  bgColor: string;
  onFix?: (next: { fgColor: string; bgColor: string }) => void;
  className?: string;
}

/**
 * Compact inline readout for a section header. Uses the exact same WCAG
 * engine as the full card — only the presentation differs.
 */
export function ContrastInlineBadge({ fgColor, bgColor, onFix, className }: ContrastBadgeProps) {
  const result = useMemo(() => {
    try {
      return evaluateContrast(fgColor, bgColor);
    } catch {
      return { ratio: 21, level: "AAA" as const, display: "21.0", critical: false };
    }
  }, [fgColor, bgColor]);

  const failing = result.level === "fail";
  const applyFix = () => {
    const fixed = autoFixContrast(fgColor, bgColor);
    if (fixed.changed !== "none") onFix?.({ fgColor: fixed.fgColor, bgColor: fixed.bgColor });
  };

  return (
    <span
      data-testid="contrast-inline-badge"
      role="status"
      aria-live="polite"
      className={cn("inline-flex items-center gap-1.5", className)}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums",
          failing ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
        )}
      >
        {failing ? (
          <ShieldAlert className="h-3 w-3" aria-hidden />
        ) : (
          <ShieldCheck className="h-3 w-3" aria-hidden />
        )}
        {failing
          ? `Low contrast (${result.display}:1) — hard to scan`
          : `${result.level} · ${result.display}:1`}
      </span>
      {failing && onFix && (
        <button
          type="button"
          onClick={applyFix}
          className="inline-flex items-center gap-1 rounded-full border border-foreground bg-foreground px-2 py-0.5 text-[10px] font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Wand2 className="h-2.5 w-2.5" aria-hidden />
          Auto-fix
        </button>
      )}
    </span>
  );
}

/**
 * Live WCAG 2.1 readout for the QR colour pair, with a one-click solver that
 * pushes the pair over the 4.5:1 AA threshold without changing the hue.
 */
export function ContrastBadge({ fgColor, bgColor, onFix, className }: ContrastBadgeProps) {
  const result = useMemo(() => {
    try {
      return evaluateContrast(fgColor, bgColor);
    } catch {
      return { ratio: 21, level: "AAA" as const, display: "21.0", critical: false };
    }
  }, [fgColor, bgColor]);

  const Icon =
    result.level === "AAA"
      ? ShieldCheck
      : result.level === "AA"
        ? ShieldCheck
        : result.critical
          ? ShieldX
          : ShieldAlert;
  const label =
    result.level === "AAA"
      ? "AAA — excellent"
      : result.level === "AA"
        ? "AA — scannable"
        : "Fails AA — risky scan";

  const applyFix = () => {
    const fixed = autoFixContrast(fgColor, bgColor);
    if (fixed.changed !== "none") onFix?.({ fgColor: fixed.fgColor, bgColor: fixed.bgColor });
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-xl border px-3 py-2",
        result.level === "fail"
          ? "border-destructive/50 bg-destructive/5"
          : "border-border bg-muted/40",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Icon
          className={cn(
            "h-4 w-4 shrink-0",
            result.level === "fail" ? "text-destructive" : "text-foreground",
          )}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground truncate">
            {result.display}:1 · {label}
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            Cameras need 4.5:1 or higher to decode reliably.
          </p>
        </div>
      </div>
      {result.level === "fail" && onFix && (
        <button
          type="button"
          onClick={applyFix}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-foreground bg-foreground px-2.5 py-1 text-[11px] font-medium text-background transition-opacity hover:opacity-90"
        >
          <Wand2 className="h-3 w-3" aria-hidden />
          Auto-fix
        </button>
      )}
    </div>
  );
}
