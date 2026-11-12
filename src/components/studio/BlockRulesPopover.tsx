import { useTranslation } from "react-i18next";
import { Settings2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { BlockContextTag, BlockVisibilityRule, ProfileBlock } from "@/lib/profile";
import { cn } from "@/lib/utils";

const RULES: { id: BlockVisibilityRule; label: string }[] = [
  { id: "always_visible", label: "Altijd zichtbaar" },
  { id: "hide_when_focus_mode", label: "Verbergen in focusmodus" },
  { id: "show_only_when_live", label: "Alleen tonen als ik online ben" },
];

const TAGS: { id: BlockContextTag; label: string }[] = [
  { id: "global", label: "Global" },
  { id: "professional", label: "Professioneel" },
  { id: "social", label: "Sociaal" },
];

interface Props {
  block: ProfileBlock;
  onChange: (next: Partial<ProfileBlock>) => void;
}

/** ⚙️ "Context & Regels" per link or component. */
export function BlockRulesPopover({ block, onChange }: Props) {
  const { t } = useTranslation();
  const rule = block.visibilityRule ?? "always_visible";
  const tag = block.contextTag ?? "global";
  const active = rule !== "always_visible" || tag !== "global";

  const pill = (on: boolean) =>
    cn(
      "rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors",
      on ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted",
    );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("studio.rules.title")}
          className={cn(
            "shrink-0 rounded-lg p-1 transition-colors hover:bg-muted",
            active ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4">
        <p className="text-sm font-medium">{t("studio.rules.title")}</p>
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("studio.rules.when")}</p>
          <div className="grid gap-1.5">
            {RULES.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={rule === r.id}
                onClick={() => onChange({ visibilityRule: r.id === "always_visible" ? undefined : r.id })}
                className={pill(rule === r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("studio.rules.context")}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {TAGS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tag === t.id}
                onClick={() => onChange({ contextTag: t.id === "global" ? undefined : t.id })}
                className={cn(pill(tag === t.id), "text-center")}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground"> {t("studio.rules.help")} </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
