import { PROFILE_THEMES } from "@/lib/profile";
import { TYPOGRAPHY_STYLES, type Typography } from "@/lib/profile-display";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Stap 2: thema en lettertype — het voorbeeld verandert meteen mee. */
export function TourDesignStep({
  theme,
  typography,
  onTheme,
  onTypography,
}: {
  theme: string;
  typography: Typography;
  onTheme: (value: string) => void;
  onTypography: (value: Typography) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t("tour.design.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("tour.design.body")}</p>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("tour.design.themeLabel")}
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {PROFILE_THEMES.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={theme === option.id}
              onClick={() => onTheme(option.id)}
              className={cn(
                "rounded-2xl border p-3 text-left transition",
                theme === option.id ? "border-foreground" : "border-border hover:bg-muted/40",
              )}
            >
              <span
                className="mb-2 block h-10 w-full rounded-lg border"
                style={{ background: option.bg, borderColor: option.border }}
              />
              <span className="text-xs font-medium">{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("tour.design.typographyLabel")}
        </p>
        <div className="flex flex-wrap gap-2">
          {TYPOGRAPHY_STYLES.map((font) => (
            <button
              key={font.id}
              type="button"
              aria-pressed={typography === font.id}
              onClick={() => onTypography(font.id)}
              className={cn(
                "rounded-full border px-4 py-2 text-xs transition",
                typography === font.id
                  ? "border-foreground bg-muted/60"
                  : "border-border hover:bg-muted/40",
              )}
            >
              {font.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
