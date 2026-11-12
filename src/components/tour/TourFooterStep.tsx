import { StudioSectionIcon } from "@/components/studio/StudioSectionIcon";
import { FOOTER_STYLES, type FooterStyle } from "@/lib/profile-display";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Stap 5: 🏷️ Footer & Branding — slotzin, stijl, accentkleur en ROUT-badge. */
export function TourFooterStep({
  tagline,
  style,
  accent,
  showRoutBadge,
  onTagline,
  onStyle,
  onAccent,
  onShowRoutBadge,
}: {
  tagline: string;
  style: FooterStyle;
  accent: string;
  showRoutBadge: boolean;
  onTagline: (value: string) => void;
  onStyle: (value: FooterStyle) => void;
  onAccent: (value: string) => void;
  onShowRoutBadge: (value: boolean) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
          <StudioSectionIcon kind="footer" className="mr-2 inline size-6 align-[-4px]" />{t("tour.footer.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("tour.footer.body")}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tour-footer-tagline">{t("tour.footer.tagline")}</Label>
        <Input
          id="tour-footer-tagline"
          value={tagline}
          maxLength={80}
          onChange={(e) => onTagline(e.target.value)}
          placeholder={t("tour.footer.taglinePlaceholder")}
        />
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("tour.footer.style")}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {FOOTER_STYLES.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={style === option.id}
              onClick={() => onStyle(option.id)}
              className={cn(
                "rounded-2xl border p-3 text-left transition",
                style === option.id
                  ? "border-foreground bg-muted/40"
                  : "border-border hover:bg-muted/30",
              )}
            >
              <span className="block text-sm font-medium">{option.label}</span>
              <span className="block text-xs text-muted-foreground">{option.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tour-footer-accent">{t("tour.footer.accent")}</Label>
        <div className="flex items-center gap-2">
          <input
            id="tour-footer-accent"
            type="color"
            value={accent || "#888888"}
            onChange={(e) => onAccent(e.target.value)}
            className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent p-1"
          />
          <Input
            value={accent}
            onChange={(e) => onAccent(e.target.value)}
            placeholder={t("tour.footer.accentPlaceholder")}
            spellCheck={false}
            className="h-10 font-mono text-xs"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border p-4">
        <div>
          <p className="text-sm font-medium">{t("tour.footer.badge")}</p>
          <p className="text-xs text-muted-foreground">{t("tour.footer.badgeHint")}</p>
        </div>
        <Switch checked={showRoutBadge} onCheckedChange={onShowRoutBadge} />
      </div>
    </div>
  );
}
