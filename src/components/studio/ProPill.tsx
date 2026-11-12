import { cn } from "@/lib/utils";

/** Minimal "PRO" marker next to features that will be part of ROUT Pro. */
export function ProPill({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-primary",
        className,
      )}
    >
      Pro
    </span>
  );
}
