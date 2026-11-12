import { Globe } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  EXTENDED_LOCALES,
  PRIMARY_LOCALES,
  useLegalLocale,
  type LegalLocale,
} from "@/lib/legal-locale";
import { cn } from "@/lib/utils";

const pill =
  "inline-flex h-8 min-w-9 items-center justify-center rounded-full border px-2.5 font-mono text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * NL / FR / EN pills plus a globe dropdown with the extended locales.
 * The dropdown label doubles as the active indicator for extended locales.
 */
export function LegalLanguageSwitcher({
  label,
  more,
  className,
}: {
  label: string;
  more: string;
  className?: string;
}) {
  const { locale, setLocale } = useLegalLocale();
  const extendedActive = EXTENDED_LOCALES.find((l) => l.id === locale);

  const select = (id: LegalLocale) => {
    // Preserve scroll position: only the text content swaps.
    setLocale(id);
  };

  return (
    <div className={cn("no-print flex items-center gap-1.5", className)} aria-label={label}>
      <div role="group" aria-label={label} className="flex items-center gap-1.5">
        {PRIMARY_LOCALES.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => select(l.id)}
            aria-pressed={locale === l.id}
            title={l.name}
            className={cn(
              pill,
              locale === l.id
                ? "border-foreground bg-foreground text-background"
                : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {l.label}
          </button>
        ))}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            pill,
            "gap-1.5",
            extendedActive
              ? "border-foreground bg-foreground text-background"
              : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          aria-label={more}
        >
          <Globe className="size-3.5" aria-hidden />
          {extendedActive ? extendedActive.label : more}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          {EXTENDED_LOCALES.map((l) => (
            <DropdownMenuItem
              key={l.id}
              onSelect={() => select(l.id)}
              className={cn("justify-between gap-3", locale === l.id && "font-medium")}
            >
              <span>{l.name}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{l.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
