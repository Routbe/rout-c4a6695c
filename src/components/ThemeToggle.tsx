import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme, ThemeMode } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
}

const OPTIONS: { id: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { id: "system", label: "Match system", Icon: Monitor },
  { id: "light", label: "Light mode", Icon: Sun },
  { id: "dark", label: "Dark mode", Icon: Moon },
];

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { mode, setMode } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Colour mode"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-border bg-card p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={mode === id}
          aria-label={label}
          title={label}
          onClick={() => setMode(id)}
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
            mode === id
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
          )}
        >
          <Icon className="h-[15px] w-[15px]" strokeWidth={1.6} />
        </button>
      ))}
    </div>
  );
}
