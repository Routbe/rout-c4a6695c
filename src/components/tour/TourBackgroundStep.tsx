import { StudioSectionIcon } from "@/components/studio/StudioSectionIcon";
import { PROFILE_THEMES } from "@/lib/profile";
import {
  BACKGROUND_STYLES,
  GRADIENT_PRESETS,
  WALLPAPER_TYPES,
  type BackgroundStyle,
  type WallpaperType,
} from "@/lib/profile-display";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Stap 3: 🖼️ Achtergrond & Visual FX — thema, achtergrondstijl en wallpaper. */
export function TourBackgroundStep({
  theme,
  backgroundStyle,
  wallpaperType,
  wallpaperColor,
  wallpaperGradient,
  onTheme,
  onBackgroundStyle,
  onWallpaperType,
  onWallpaperColor,
  onWallpaperGradient,
}: {
  theme: string;
  backgroundStyle: BackgroundStyle;
  wallpaperType: WallpaperType;
  wallpaperColor: string;
  wallpaperGradient: string;
  onTheme: (value: string) => void;
  onBackgroundStyle: (value: BackgroundStyle) => void;
  onWallpaperType: (value: WallpaperType) => void;
  onWallpaperColor: (value: string) => void;
  onWallpaperGradient: (value: string) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
          <StudioSectionIcon kind="background" className="mr-2 inline size-6 align-[-4px]" />{t("tour.background.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("tour.background.body")}</p>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("tour.background.theme")}
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
          {t("tour.background.style")}
        </p>
        <div className="flex flex-wrap gap-2">
          {BACKGROUND_STYLES.map((style) => (
            <button
              key={style.id}
              type="button"
              aria-pressed={backgroundStyle === style.id}
              onClick={() => onBackgroundStyle(style.id)}
              className={cn(
                "rounded-full border px-3 py-2 text-xs transition",
                backgroundStyle === style.id
                  ? "border-foreground bg-muted/60"
                  : "border-border hover:bg-muted/40",
              )}
            >
              {style.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("tour.background.wallpaper")}
        </p>
        <div className="flex flex-wrap gap-2">
          {WALLPAPER_TYPES.filter((w) => w.id !== "image").map((w) => (
            <button
              key={w.id}
              type="button"
              aria-pressed={wallpaperType === w.id}
              onClick={() => onWallpaperType(w.id)}
              className={cn(
                "rounded-full border px-3 py-2 text-xs transition",
                wallpaperType === w.id
                  ? "border-foreground bg-muted/60"
                  : "border-border hover:bg-muted/40",
              )}
            >
              {w.label}
            </button>
          ))}
        </div>

        {wallpaperType === "solid" ? (
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label={t("tour.background.color")}
              value={wallpaperColor || "#111111"}
              onChange={(e) => onWallpaperColor(e.target.value)}
              className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent p-1"
            />
            <Input
              value={wallpaperColor}
              onChange={(e) => onWallpaperColor(e.target.value)}
              placeholder="#0d0d0d"
              spellCheck={false}
              className="h-10 font-mono text-xs"
            />
          </div>
        ) : null}

        {wallpaperType === "gradient" ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {GRADIENT_PRESETS.map((g) => (
              <button
                key={g.id}
                type="button"
                aria-pressed={wallpaperGradient === g.id}
                onClick={() => onWallpaperGradient(g.id)}
                className={cn(
                  "rounded-xl border p-1.5 text-left transition",
                  wallpaperGradient === g.id ? "border-foreground" : "border-border",
                )}
              >
                <span className="mb-1 block h-8 w-full rounded-lg" style={{ background: g.css }} />
                <span className="text-[11px]">{g.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
