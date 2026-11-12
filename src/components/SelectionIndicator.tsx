import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Single source of truth for the "this tile is selected" affordance.
 *
 * Every picker (themes, patterns, center logo) renders this exact badge in the
 * same corner, so selection reads identically across the studio. The parent
 * tile must be `relative` and must NOT clip overflow — the badge deliberately
 * sits half outside the border radius.
 */
export function SelectionIndicator({
  visible,
  className,
}: {
  visible: boolean;
  className?: string;
}) {
  if (!visible) return null;
  return (
    <span
      aria-hidden
      data-testid="selection-indicator"
      className={cn(
        "pointer-events-none absolute -right-1.5 -top-1.5 z-10 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-foreground text-background shadow-sm ring-2 ring-background",
        className,
      )}
      style={{ height: "1.125rem", width: "1.125rem" }}
    >
      <Check className="h-2.5 w-2.5" strokeWidth={3} />
    </span>
  );
}

/**
 * Global selection styling for every interactive option in the configurator —
 * theme presets, pattern grids, center logos, colour swatches, frame cards,
 * frame text pills, print sizes, file formats and quiet-zone options.
 *
 * Always `relative` + non-clipping so the corner checkmark lands precisely.
 */
export function selectionCardClass(isSelected: boolean, className?: string) {
  return cn(
    "relative overflow-visible border-2 transition-all duration-200",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    isSelected
      ? "border-foreground bg-muted/40 text-foreground"
      : "border-border bg-background hover:border-primary/50 hover:bg-muted/60",
    className,
  );
}

/**
 * Drop-in button wrapper: unified border ring + top-right checkmark badge.
 */
export function SelectedOptionCard({
  isSelected,
  onSelect,
  className,
  children,
  ...rest
}: {
  isSelected: boolean;
  onSelect: () => void;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onSelect" | "className" | "children">) {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      data-selected={isSelected ? "true" : undefined}
      onClick={onSelect}
      className={selectionCardClass(isSelected, className)}
      {...rest}
    >
      <SelectionIndicator visible={isSelected} />
      {children}
    </button>
  );
}
