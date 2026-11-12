import { useRef } from "react";
import { useI18n, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useLanguagePreference } from "@/hooks/useLanguagePreference";

const OPTIONS: { id: Locale; label: string }[] = [
  { id: "nl", label: "NL" },
  { id: "en", label: "EN" },
  { id: "fr", label: "FR" },
  { id: "de", label: "DE" },
];

export function LanguageToggle({ className }: { className?: string }) {
  const { locale, t } = useI18n();
  // Switching here persists to the device cookie and, when signed in, to the account.
  const { save: setLocale } = useLanguagePreference();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  /** Roving focus: arrow keys move + select, Home/End jump to the edges. */
  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = OPTIONS.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    const option = OPTIONS[next];
    if (!option) return;
    void setLocale(option.id);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={t("nav.language")}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-border bg-card p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ id, label }, index) => {
        const active = locale === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            lang={id}
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            ref={(el) => {
              refs.current[index] = el;
            }}
            onKeyDown={(e) => onKeyDown(e, index)}
            onClick={() => void setLocale(id)}
            className={cn(
              "inline-flex h-7 px-2.5 items-center justify-center rounded-full text-[11px] font-medium tracking-wide transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
