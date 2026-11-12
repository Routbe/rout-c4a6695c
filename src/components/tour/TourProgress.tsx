import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Compacte voortgangsbalk boven de rondleiding — leesbaar vanaf 320 px breed. */
export function TourProgress({ steps, current }: { steps: string[]; current: number }) {
  // De intro (index 0) staat op 0%; de laatste stap op 100%.
  const pct = steps.length > 1 ? (current / (steps.length - 1)) * 100 : 0;
  return (
    <div className="space-y-3">

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-foreground transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {steps.map((label, index) => (
          <li
            key={label}
            className={cn(
              "flex items-center gap-1.5",
              index === current
                ? "font-medium text-foreground"
                : index < current
                  ? "text-muted-foreground"
                  : "text-muted-foreground/60",
            )}
          >
            {index < current ? (
              <Check className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <span aria-hidden>{index + 1}.</span>
            )}
            {label}
          </li>
        ))}
      </ol>
    </div>
  );
}
