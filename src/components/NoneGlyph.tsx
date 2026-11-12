import { CircleOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Eén gedeeld "Geen"-teken (ø) voor alle pickers: logo, thema, achtergrond en
 * kader. Zo ziet de optie "Geen" overal exact hetzelfde uit — geen
 * schaakbordpatronen meer.
 */
export function NoneGlyph({
  className,
  size = "md",
}: {
  className?: string;
  /** sm = binnen kleine swatches, md = binnen kaartjes */
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-border/70 bg-muted/70 text-muted-foreground",
        size === "sm" ? "h-full w-full" : "h-7 w-7",
        className,
      )}
      aria-hidden
    >
      <CircleOff className={size === "sm" ? "h-4 w-4" : "h-4 w-4"} strokeWidth={1.5} />
    </span>
  );
}
