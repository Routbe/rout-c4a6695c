import {
  FONT_PAIRINGS,
  TYPOGRAPHY_STYLES,
  type FontPairing,
  type Typography,
} from "@/lib/profile-display";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Stap 4: Typografie — basisletter en letterkoppel. */
export function TourTypographyStep({
  typography,
  fontPairing,
  onTypography,
  onFontPairing,
}: {
  typography: Typography;
  fontPairing: FontPairing;
  onTypography: (value: Typography) => void;
  onFontPairing: (value: FontPairing) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t("tour.typography.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("tour.typography.body")}</p>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("tour.typography.base")}
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

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("tour.typography.pairing")}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {FONT_PAIRINGS.map((pair) => (
            <button
              key={pair.id}
              type="button"
              aria-pressed={fontPairing === pair.id}
              onClick={() => onFontPairing(pair.id)}
              className={cn(
                "rounded-2xl border p-3 text-left transition",
                fontPairing === pair.id
                  ? "border-foreground bg-muted/40"
                  : "border-border hover:bg-muted/30",
              )}
            >
              <span className="block text-sm font-semibold" style={{ fontFamily: pair.heading }}>
                {pair.label}
              </span>
              <span
                className="block text-xs text-muted-foreground"
                style={{ fontFamily: pair.body }}
              >
                {pair.note}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
