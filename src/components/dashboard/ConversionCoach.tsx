import { AlertTriangle, Lightbulb, MoveVertical } from "lucide-react";
import { conversionTips } from "@/lib/conversion-coach";
import type { ProfileBlock } from "@/lib/profile";

const ICON = {
  warning: AlertTriangle,
  hint: Lightbulb,
  info: MoveVertical,
} as const;

/** Inline micro-widget bovenaan "Links & components" met conversietips. */
export function ConversionCoach({ blocks }: { blocks: ProfileBlock[] }) {
  const tips = conversionTips(blocks);
  if (tips.length === 0) return null;

  return (
    <section
      aria-label="Conversie tips"
      className="space-y-2 rounded-2xl border border-border bg-card p-4 sm:p-5"
    >
      <h2 className="text-sm font-medium text-foreground">Conversie tips</h2>
      <ul className="space-y-1.5">
        {tips.map((tip) => {
          const Icon = ICON[tip.tone];
          return (
            <li
              key={tip.id}
              className="flex items-start gap-2 rounded-xl border border-border/60 bg-background px-3 py-2 text-xs text-muted-foreground"
            >
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{tip.message}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
