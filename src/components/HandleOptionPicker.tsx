import { Check, Lock, RefreshCw, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export type HandleOptionStatus = "available" | "taken" | "reserved";
export interface HandleOption {
  handle: string;
  status: HandleOptionStatus;
}

interface Props {
  options: HandleOption[];
  loading: boolean;
  value: string;
  onSelect: (handle: string) => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
  /** Locks the whole picker while a claim is being saved. */
  disabled?: boolean;
}

/**
 * Verified members pick their handle from server-generated name combinations
 * instead of typing free text. Every option holds at least one full name
 * part, and availability is checked server-side (never trust a client guess).
 */
export function HandleOptionPicker({
  options,
  loading,
  value,
  onSelect,
  onRegenerate,
  regenerating,
  disabled: locked,
}: Props) {
  const { t } = useI18n();

  if (loading) {
    return (
      <ul aria-label={t("handlePicker.loading")} className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <li
            key={i}
            className="h-11 animate-pulse rounded-2xl border border-border/60 bg-muted/30"
            aria-hidden
          />
        ))}
      </ul>
    );
  }

  if (options.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
        <p className="text-sm text-foreground">{t("handlePicker.empty.title")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("handlePicker.empty.body")}</p>
        {onRegenerate ? (
          <button
            type="button"
            onClick={onRegenerate}
            disabled={regenerating || locked}
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`}
              aria-hidden
            />
            {t("handlePicker.retry")}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t("handlePicker.pick")}</p>
      <ul
        role="radiogroup"
        aria-label={t("handlePicker.groupLabel")}
        className="grid gap-2 sm:grid-cols-2"
      >
        {options.map((option) => {
          const selected = option.handle === value;
          const disabled = option.status !== "available" || Boolean(locked);
          return (
            <li key={option.handle}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                aria-disabled={disabled}
                disabled={disabled}
                onClick={() => !disabled && onSelect(option.handle)}
                className={`flex w-full items-center justify-between gap-2 rounded-2xl border px-4 py-3 text-left font-mono text-sm transition-colors ${
                  disabled
                    ? "cursor-not-allowed border-border/50 bg-muted/20 text-muted-foreground/50"
                    : selected
                      ? "border-foreground/40 bg-foreground/5 text-foreground"
                      : "border-border/60 bg-card/40 text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <span className="truncate">@{option.handle}</span>
                {selected ? (
                  <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                ) : option.status === "taken" ? (
                  <span className="flex shrink-0 items-center gap-1 text-[10px] uppercase tracking-wide">
                    <X className="h-3 w-3" aria-hidden /> {t("handlePicker.taken")}
                  </span>
                ) : option.status === "reserved" ? (
                  <span className="flex shrink-0 items-center gap-1 text-[10px] uppercase tracking-wide">
                    <Lock className="h-3 w-3" aria-hidden /> {t("handlePicker.reserved")}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {onRegenerate ? (
        <button
          type="button"
          onClick={onRegenerate}
          disabled={regenerating || locked}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} aria-hidden />
          {t("handlePicker.more")}
        </button>
      ) : null}
    </div>
  );
}
