import { Check, CircleDashed, Loader2, XCircle } from "lucide-react";

export type TransferStage = "created" | "pending" | "completed" | "failed";

const STEPS: { key: TransferStage; label: string }[] = [
  { key: "created", label: "Aangemaakt" },
  { key: "pending", label: "Onderweg" },
  { key: "completed", label: "Ontvangen" },
];

const ORDER: Record<TransferStage, number> = {
  created: 0,
  pending: 1,
  completed: 2,
  failed: 1,
};

/**
 * Compacte levenscyclus van een bankoverschrijving. De stand komt uit de
 * webhook-/statuspolling van de checkout, zodat de betaler live ziet waar zijn
 * overschrijving zit zonder de pagina te verversen.
 */
export function TransferLifecycle({
  stage,
  updatedAt,
  note,
}: {
  stage: TransferStage;
  updatedAt?: string | null;
  note?: string | null;
}) {
  const current = ORDER[stage];

  return (
    <div className="space-y-2 rounded-lg border border-border bg-background px-3 py-2.5">
      <ol className="flex items-center gap-2">
        {STEPS.map((step, index) => {
          const done = stage !== "failed" && current > index;
          const active = stage !== "failed" && current === index;
          const failed = stage === "failed" && index === 1;
          return (
            <li key={step.key} className="flex flex-1 items-center gap-2">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  failed
                    ? "border-destructive/50 bg-destructive/10 text-destructive"
                    : done
                      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : active
                        ? "border-border bg-muted text-foreground"
                        : "border-border/70 bg-background text-muted-foreground"
                }`}
              >
                {failed ? (
                  <XCircle className="h-3 w-3" aria-hidden />
                ) : done ? (
                  <Check className="h-3 w-3" aria-hidden />
                ) : active ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                ) : (
                  <CircleDashed className="h-3 w-3" aria-hidden />
                )}
              </span>
              <span
                className={`truncate text-[11px] font-medium ${
                  done || active ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {failed ? "Mislukt" : step.label}
              </span>
              {index < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className={`hidden h-px flex-1 sm:block ${
                    done ? "bg-emerald-500/40" : "bg-border"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
      {(note || updatedAt) && (
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {note}
          {note && updatedAt ? " · " : ""}
          {updatedAt ? `bijgewerkt ${new Date(updatedAt).toLocaleString("nl-BE")}` : ""}
        </p>
      )}
    </div>
  );
}
