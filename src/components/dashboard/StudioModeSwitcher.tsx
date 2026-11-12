import { BadgeCheck, HeartHandshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { snappySpringPreset } from "@/lib/spatial-motion";

type Mode = "profile" | "tip";

/** Only offer switching when both editable destinations are available. */
export function StudioModeSwitcher({ mode, onChange, handle, enabled = true }: { mode: Mode; onChange: (m: Mode) => void; handle: string; enabled?: boolean }) {
  const { t } = useI18n();
  const indicatorId = useId();
  const [hovered, setHovered] = useState<Mode | null>(null);
  const reduced = useReducedMotion();
  if (!enabled && mode === "profile") return null;
  const destinations = [
    { id: "profile" as const, Icon: BadgeCheck },
    { id: "tip" as const, Icon: HeartHandshake },
  ];
  return (
    <div role="tablist" aria-label="Studio" data-tour="studio-mode" onPointerLeave={() => setHovered(null)} className="spatial-track mb-3 flex flex-wrap gap-1 p-1">
      {destinations.map(({ id, Icon }) => (
        <Button key={id} variant="ghost" type="button" role="tab" aria-selected={mode === id} disabled={id === "tip" && !enabled} onPointerEnter={() => setHovered(id)} onFocus={() => setHovered(id)} onBlur={() => setHovered(null)} onClick={() => onChange(id)} className={`spatial-tab min-h-12 h-auto min-w-0 flex-1 justify-start gap-2 whitespace-normal rounded-lg border-0 px-3 py-2 text-left ${mode === id ? "text-foreground" : "text-muted-foreground"}`}>
          {(hovered ?? mode) === id && <motion.span className="spatial-indicator" layoutId={`studio-indicator-${indicatorId}`} transition={reduced ? { duration: 0 } : snappySpringPreset} aria-hidden />}
          <Icon className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{t(id === "profile" ? "studio.mode.profile" : "studio.mode.tip")}</span>
            <span className="block truncate font-mono text-[11px] opacity-70">rout.be/{handle}{id === "tip" ? "/tip" : ""}</span>
          </span>
        </Button>
      ))}
    </div>
  );
}
