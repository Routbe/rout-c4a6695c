import { useEffect, useState } from "react";
import { AlertTriangle, RotateCw, Settings2, Sparkles, X } from "lucide-react";
import { BrandSuggestion, BRAND_SHAPE_LABELS, type BrandShapeKey } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** What "Brand it" is allowed to touch, plus the tweaks the user made. */
export interface BrandApplyOptions {
  colors: boolean;
  style: boolean;
  logo: boolean;
  /** Shape language override (defaults to the detected one). */
  shape: BrandShapeKey;
  /** Swap which brand colour becomes the dots and which becomes the paper. */
  invert: boolean;
}

interface BrandSuggestionCardProps {
  brand: BrandSuggestion;
  onApply: (options: BrandApplyOptions) => void;
  onDismiss: () => void;
  /** True while the brand logo is being fetched. */
  busy?: boolean;
  /** Set when the last logo fetch failed — shows the retry affordance. */
  logoError?: string | null;
  className?: string;
}

export function BrandSuggestionCard({
  brand,
  onApply,
  onDismiss,
  busy = false,
  logoError = null,
  className,
}: BrandSuggestionCardProps) {
  const [open, setOpen] = useState(false);
  const [colors, setColors] = useState(true);
  const [style, setStyle] = useState(true);
  const [logo, setLogo] = useState(true);
  const [invert, setInvert] = useState(false);
  const [shape, setShape] = useState<BrandShapeKey>(brand.shapeKey);

  // A new domain means a new suggestion: reset the tweaks.
  useEffect(() => {
    setShape(brand.shapeKey);
    setInvert(false);
  }, [brand.domain, brand.shapeKey]);

  const fg = invert ? brand.bgColor : brand.fgColor;
  const bg = invert ? brand.fgColor : brand.bgColor;

  const apply = (overrides?: Partial<BrandApplyOptions>) =>
    onApply({ colors, style, logo, shape, invert, ...overrides });

  return (
    <div className={cn("rounded-2xl border border-border bg-card/60 p-3 space-y-2.5", className)}>
      <div className="flex items-start gap-2.5">
        <img
          src={brand.logo}
          alt=""
          className="w-8 h-8 rounded-lg object-contain bg-background border border-border/70 p-0.5"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
          }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            {brand.name} detected
          </p>
          <p className="text-[11px] text-muted-foreground truncate">{brand.domain}</p>
        </div>
        <div className="flex items-center gap-1">
          <span
            className="w-4 h-4 rounded-full border border-border"
            style={{ backgroundColor: fg }}
          />
          <span
            className="w-4 h-4 rounded-full border border-border"
            style={{ backgroundColor: bg }}
          />
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss brand suggestion"
            className="ml-1 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => apply()}
          disabled={busy}
          className="flex-1 h-8 rounded-xl bg-foreground text-background text-[11px] font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {busy ? "Branding…" : "Brand it"}
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="h-8 px-3 rounded-xl border border-border text-[11px] font-medium text-foreground hover:bg-muted/60 transition-colors inline-flex items-center gap-1.5"
        >
          <Settings2 className="w-3.5 h-3.5" /> Instellingen
        </button>
      </div>

      {logoError && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-2 space-y-1.5">
          <p className="text-[11px] text-foreground flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-destructive" />
            {logoError}
          </p>
          <button
            type="button"
            onClick={() => apply({ colors: false, style: false, logo: true })}
            disabled={busy}
            className="h-7 px-2.5 rounded-lg border border-border text-[11px] font-medium inline-flex items-center gap-1.5 hover:bg-muted/60 disabled:opacity-60"
          >
            <RotateCw className="w-3 h-3" /> Opnieuw proberen
          </button>
        </div>
      )}

      {open && (
        <div className="space-y-2.5 border-t border-border/70 pt-2.5">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["Kleuren", colors, setColors],
                ["Stijl", style, setStyle],
                ["Logo", logo, setLogo],
              ] as const
            ).map(([label, on, set]) => (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                onClick={() => set(!on)}
                className={cn(
                  "h-7 px-2.5 rounded-lg border text-[11px] font-medium transition-colors",
                  on
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:bg-muted/60",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] text-muted-foreground">QR-stijl</p>
            <div className="flex flex-wrap gap-1.5">
              {BRAND_SHAPE_LABELS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={shape === s.id}
                  onClick={() => setShape(s.id)}
                  className={cn(
                    "h-7 px-2.5 rounded-lg border text-[11px] font-medium transition-colors",
                    shape === s.id
                      ? "border-foreground bg-muted/60 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted/60",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            aria-pressed={invert}
            onClick={() => setInvert((v) => !v)}
            className={cn(
              "h-7 px-2.5 rounded-lg border text-[11px] font-medium transition-colors",
              invert
                ? "border-foreground bg-muted/60 text-foreground"
                : "border-border text-muted-foreground hover:bg-muted/60",
            )}
          >
            Kleuren omwisselen
          </button>
        </div>
      )}
    </div>
  );
}
