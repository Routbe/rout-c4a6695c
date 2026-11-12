import { useId, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { snappySpringPreset } from "@/lib/spatial-motion";
import { cn } from "@/lib/utils";

/** A controlled choice track: animation never commits a choice or performs an action. */
export function SpatialChoice<T extends string>({ value, options, onChange, label, disabled, className, role = "group" }: {
  value: T;
  options: readonly { value: T; label: ReactNode; title?: string; disabled?: boolean }[];
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
  className?: string;
  role?: "group" | "tablist";
}) {
  const id = useId();
  const reduced = useReducedMotion();
  return <div role={role} aria-label={label} className={cn("spatial-track flex min-w-0 max-w-full gap-1 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
    {options.map((option) => <Button key={option.value} type="button" variant="ghost"
      role={role === "tablist" ? "tab" : undefined}
      aria-selected={role === "tablist" ? value === option.value : undefined}
      aria-pressed={role === "group" ? value === option.value : undefined}
      tabIndex={role === "tablist" ? (value === option.value ? 0 : -1) : undefined}
      disabled={disabled || option.disabled} title={option.title}
      onClick={() => onChange(option.value)}
      onKeyDown={(event) => {
        if (role !== "tablist" || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const available = options.filter((item) => !item.disabled);
        const index = available.findIndex((item) => item.value === option.value);
        const next = event.key === "Home" ? available[0] : event.key === "End" ? available.at(-1) : available[(index + (event.key === "ArrowRight" ? 1 : -1) + available.length) % available.length];
        if (!next || disabled) return;
        const target = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[options.findIndex((item) => item.value === next.value)];
        target?.focus();
        onChange(next.value);
      }}
      className={cn("spatial-tab min-w-max max-w-none flex-[1_0_auto] shrink-0 justify-center gap-1.5 whitespace-nowrap px-3 text-xs [&_svg]:shrink-0", value === option.value ? "text-foreground" : "text-muted-foreground")}>
      {value === option.value && <motion.span aria-hidden className="spatial-indicator" layoutId={`choice-${id}`} initial={false} transition={reduced ? { duration: 0 } : snappySpringPreset} />}
      {option.label}
    </Button>)}
  </div>;
}