import { CheckCircle2, AlertTriangle, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { checkVersion1Canvas } from "@/lib/studio-limits";

/**
 * Canvas-indicator met automatische versieschaling.
 *
 * Version 1 (21×21) is het scherpste, snelst scanbare canvas. Wordt de payload
 * langer, dan schaalt de encoder zelf naar een hogere versie — dat melden we
 * neutraal in plaats van als fout. Pas boven Version 10 waarschuwen we.
 */
export function CanvasIndicator({ payload, className }: { payload: string; className?: string }) {
  const check = checkVersion1Canvas(payload);
  const tone = check.isVersion1 ? "ok" : check.fits ? "info" : "warn";
  const Icon = tone === "ok" ? CheckCircle2 : tone === "info" ? Maximize2 : AlertTriangle;

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-xl border px-3 py-2 text-xs",
        tone === "ok" &&
          "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
        tone === "info" && "border-border bg-muted/40 text-muted-foreground",
        tone === "warn" && "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0">
        <span className="font-medium">
          {check.modules}×{check.modules} modules (Version {check.version})
        </span>
        <span className="mt-0.5 block font-mono text-[11px] opacity-80">
          {check.length}/{check.capacity} tekens
        </span>
        {check.reason ? <span className="mt-0.5 block opacity-90">{check.reason}</span> : null}
      </span>
    </div>
  );
}
