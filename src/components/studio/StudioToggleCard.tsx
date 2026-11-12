import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Switch } from "@/components/ui/switch";

/**
 * Componentkaart in de Studio: meteen aan/uit via de schakelaar, en met het
 * pijltje open je de volledige instellingen.
 */
export function StudioToggleCard({ icon, title, subtitle, checked, onCheckedChange, children, id, unframed = false }: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  children: ReactNode;
  id?: string;
  unframed?: boolean;
}) {
  return (
    <details id={id} className={unframed ? "group border-b border-border py-2" : "acrylic-card group px-4 py-2 sm:px-5"}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <span className="shrink-0">{icon}</span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block min-w-0 break-words text-sm font-medium">{title}</span>
          {subtitle && <span className="block min-w-0 break-words text-xs text-muted-foreground">{subtitle}</span>}
        </span>
        <span className="shrink-0" onClick={(e) => e.preventDefault()}>
          <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={title} />
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-3 pb-3 pt-2">{children}</div>
    </details>
  );
}
