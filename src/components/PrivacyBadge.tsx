import { Check, ShieldCheck, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/lib/i18n";
import { pillar, type Pillar, type PillarId } from "@/lib/privacy-pillars";
import { cn } from "@/lib/utils";

export function PillarDetails({ p, nl, compact = false }: { p: Pillar; nl: boolean; compact?: boolean }) {
  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="flex items-center gap-2 font-medium"><ShieldCheck className="size-4 text-primary" aria-hidden />{p.title}</p>
        <p className="mt-1 text-muted-foreground">{p.guarantee}</p>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{nl ? "Hoe dit werkt" : "How it works"}</p>
        <ul className="mt-1 list-disc space-y-1 pl-4">{p.how.map((h) => <li key={h}>{h}</li>)}</ul>
      </div>
      <div className={cn("grid gap-3", compact ? "grid-cols-1" : "sm:grid-cols-2")}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{nl ? "Wat we wél opslaan" : "What we store"}</p>
          <ul className="mt-1 space-y-1">{p.stored.map((s) => <li key={s} className="flex gap-1.5"><Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />{s}</li>)}</ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{nl ? "Wat we NIET opslaan" : "What we do NOT store"}</p>
          <ul className="mt-1 space-y-1">{p.notStored.map((s) => <li key={s} className="flex gap-1.5"><X className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden />{s}</li>)}</ul>
        </div>
      </div>
    </div>
  );
}

/** Inline badge; tap or click opens the exact guarantees for one privacy pillar. */
export function PrivacyBadge({ kind, className }: { kind: PillarId; className?: string }) {
  const { locale } = useI18n();
  const p = pillar(kind, locale);
  const nl = locale.startsWith("nl");
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        className={cn("inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
        aria-label={`${p.label}: ${nl ? "toon details" : "show details"}`}
      >
        <ShieldCheck className="size-3.5 text-primary" aria-hidden />
        {p.label}
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto">
        <PillarDetails p={p} nl={nl} compact />
        <a href={`/security#${kind}`} className="mt-3 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline">
          {nl ? "Technische details →" : "Technical deep-dive →"}
        </a>
      </PopoverContent>
    </Popover>
  );
}
