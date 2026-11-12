import { Check, Layers, SquareMousePointer } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import type { InterfaceTheme } from "@/lib/internal-interface-theme";

const OPTIONS: { value: InterfaceTheme; label: string; hint: string; Icon: typeof Layers }[] = [
  { value: "mechanical", label: "Mechanical", hint: "Rustig en precies: dunne randen, pill-knoppen, een tastbare klik op hoofdacties.", Icon: SquareMousePointer },
  { value: "glass", label: "Glass", hint: "Het oorspronkelijke zachte ontwerp met glas, vervaging en zachte schaduwen.", Icon: Layers },
];

/** Compact switch for menus. */
export function InterfaceThemeSwitcher() {
  const { interfaceTheme, setInterfaceTheme } = useTheme();
  return (
    <ToggleGroup type="single" value={interfaceTheme} aria-label="Ontwerp van je werkruimte" className="justify-start gap-1.5"
      onValueChange={value => { if (value === "mechanical" || value === "glass") setInterfaceTheme(value); }}>
      {OPTIONS.map(({ value, label, Icon }) => (
        <ToggleGroupItem key={value} value={value} className="min-h-10 flex-1 gap-2 px-3"><Icon className="size-4" />{label}</ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/**
 * Settings picker with live miniatures. Each card is artwork (outside the
 * workspace material) so both previews always show their own material.
 */
export function InterfaceThemePicker() {
  const { interfaceTheme, setInterfaceTheme } = useTheme();
  return (
    <div role="radiogroup" aria-label="Ontwerp van je werkruimte" className="grid gap-3 sm:grid-cols-2">
      {OPTIONS.map(({ value, label, hint }) => {
        const chosen = interfaceTheme === value;
        return (
          <button key={value} type="button" role="radio" aria-checked={chosen} data-interface-artwork
            onClick={() => setInterfaceTheme(value)}
            className={cn(
              "group flex flex-col gap-3 rounded-2xl border bg-card p-3 text-left transition-colors duration-150",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              chosen ? "border-foreground" : "border-border hover:border-foreground/40",
            )}>
            {value === "mechanical" ? <MechanicalPreview /> : <GlassPreview />}
            <span className="flex items-start gap-2 px-1">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">{label}{value === "mechanical" && <span className="ml-2 text-xs font-normal text-muted-foreground">standaard</span>}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{hint}</span>
              </span>
              <span aria-hidden className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-colors",
                chosen ? "border-foreground bg-foreground text-background" : "border-border text-transparent")}>
                <Check className="size-3" strokeWidth={3} />
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function MechanicalPreview() {
  return (
    <span aria-hidden className="block rounded-xl border border-foreground/10 bg-background p-3">
      <span className="flex items-center gap-1 rounded-full border border-foreground/10 bg-secondary p-0.5 text-[10px] font-medium">
        <span className="rounded-full bg-foreground px-2 py-0.5 text-background">Profiel</span>
        <span className="px-2 py-0.5 text-muted-foreground">Studio</span>
        <span className="px-2 py-0.5 text-muted-foreground">Data</span>
      </span>
      <span className="mt-2.5 block rounded-xl border border-foreground/10 bg-card p-2.5">
        <span className="block h-1.5 w-16 rounded-full bg-foreground/70" />
        <span className="mt-1.5 block h-1.5 w-24 rounded-full bg-foreground/15" />
        <span className="mt-3 flex items-center gap-2">
          <span className="rounded-full border border-foreground bg-primary px-3 py-1 text-[10px] font-medium text-primary-foreground shadow-[2px_2px_0_0_hsl(var(--foreground))] transition-[translate,box-shadow] duration-100 group-active:translate-x-[2px] group-active:translate-y-[2px] group-active:shadow-none">Publiceren</span>
          <span className="rounded-full border border-foreground/20 bg-secondary px-3 py-1 text-[10px] font-medium text-foreground">Sync</span>
        </span>
      </span>
    </span>
  );
}

function GlassPreview() {
  return (
    <span aria-hidden className="relative block overflow-hidden rounded-xl bg-gradient-to-br from-primary/35 via-accent/25 to-secondary p-3">
      <span className="absolute -right-4 -top-6 size-20 rounded-full bg-primary/40 blur-2xl" />
      <span className="absolute -bottom-8 left-6 size-20 rounded-full bg-accent/40 blur-2xl" />
      <span className="relative flex items-center gap-1 rounded-lg border border-background/40 bg-background/40 p-0.5 text-[10px] font-medium backdrop-blur-md">
        <span className="rounded-md bg-background/70 px-2 py-0.5 text-foreground shadow-sm">Profiel</span>
        <span className="px-2 py-0.5 text-foreground/70">Studio</span>
        <span className="px-2 py-0.5 text-foreground/70">Data</span>
      </span>
      <span className="relative mt-2.5 block rounded-lg border border-background/40 bg-background/45 p-2.5 shadow-lg backdrop-blur-xl">
        <span className="block h-1.5 w-16 rounded-full bg-foreground/60" />
        <span className="mt-1.5 block h-1.5 w-24 rounded-full bg-foreground/20" />
        <span className="mt-3 flex items-center gap-2">
          <span className="rounded-lg bg-primary/90 px-3 py-1 text-[10px] font-medium text-primary-foreground shadow-md">Publiceren</span>
          <span className="rounded-lg border border-background/50 bg-background/50 px-3 py-1 text-[10px] font-medium text-foreground backdrop-blur">Sync</span>
        </span>
      </span>
    </span>
  );
}
