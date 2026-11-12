import { LifeBuoy, Phone } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { CRISIS_LINES } from "@/lib/qa/crisis";
import { cn } from "@/lib/utils";

/** Quiet help bar with Belgian crisis lines; separate from the unkind-language nudge. */
export function QaCrisisHelp({ audience, className }: { audience: "sender" | "recipient"; className?: string }) {
  const { t } = useI18n();
  return (
    <aside
      aria-label={t("pages.qa.crisis.label")}
      className={cn("rounded-2xl border border-border bg-card/80 px-4 py-3 text-sm text-card-foreground", className)}
    >
      <p className="flex items-start gap-2">
        <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span>{t(audience === "sender" ? "pages.qa.crisis.sender" : "pages.qa.crisis.recipient")}</span>
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {CRISIS_LINES.map((l) => (
          <li key={l.id}>
            <a
              href={`tel:${l.tel}`}
              className="inline-flex min-h-9 select-none items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium"
            >
              <Phone className="h-3.5 w-3.5" aria-hidden />
              <span className="tabular-nums">{l.number}</span>
              <span className="text-muted-foreground">{t(`pages.qa.crisis.line.${l.id}`)}</span>
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
