import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface InfoHintProps {
  children: React.ReactNode;
  label?: string;
  className?: string;
}

/**
 * Subtle (i) affordance that tucks technical jargon away so the surface
 * stays flat and minimal.
 */
export function InfoHint({ children, label = "More info", className }: InfoHintProps) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className={cn(
          "inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <Info className="h-3.5 w-3.5" />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="w-64 rounded-2xl border-border bg-card p-3 text-[11px] leading-relaxed text-muted-foreground"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
