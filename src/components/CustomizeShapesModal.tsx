import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { DotType, CornerSquareType, CornerDotType } from "qr-code-styling";
import { ARTISTIC_PATTERNS, isArtisticPattern } from "@/lib/artistic-patterns";
import { PATTERNS, PatternGlyph, type BodyShape } from "./BodyShapeSelector";
import { i18n as trI18n } from "@/lib/i18n";

interface CustomizeShapesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bodyShape: BodyShape;
  onBodyShapeChange: (v: BodyShape) => void;
  dotStyle: DotType;
  onDotStyleChange: (v: DotType) => void;
  outerCornerStyle: CornerSquareType;
  onOuterCornerStyleChange: (v: CornerSquareType) => void;
  innerCornerStyle: CornerDotType;
  onInnerCornerStyleChange: (v: CornerDotType) => void;
  logoSize: number;
  onLogoSizeChange: (v: number) => void;
  logoMargin: number;
  onLogoMarginChange: (v: number) => void;
  hideBackgroundDots: boolean;
  onHideBackgroundDotsChange: (v: boolean) => void;
  hasLogo: boolean;
}

const DATA_SHAPES: { id: DotType; label: string }[] = [
  { id: "square", label: "Sharp squares" },
  { id: "dots", label: "Smooth dots" },
  { id: "rounded", label: "Rounded" },
  { id: "extra-rounded", label: "Fluid dashes" },
  { id: "classy", label: "Classy" },
  { id: "classy-rounded", label: "Classy round" },
];

const OUTER_SHAPES: { id: CornerSquareType; label: string }[] = [
  { id: "square", label: "Sharp" },
  { id: "extra-rounded", label: "Leaf corners" },
  { id: "dot", label: "Circular" },
];

const INNER_SHAPES: { id: CornerDotType; label: string }[] = [
  { id: "square", label: "Square" },
  { id: "dot", label: "Circle" },
];

function Chip({
  active,
  label,
  hint,
  onClick,
  testId,
  children,
}: {
  active: boolean;
  label: string;
  hint?: string;
  onClick: () => void;
  /** Stable hook for the E2E suite. */
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      title={hint ?? label}
      aria-pressed={active}
      className={cn(
        "flex min-h-11 aspect-square flex-col items-center justify-center gap-1 rounded-xl border p-1.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        active ? "gradient-border-selected" : "border-border bg-background hover:bg-muted/60",
      )}
    >
      <span className="flex h-6 w-6 items-center justify-center text-foreground">{children}</span>
      <span className="text-[8px] leading-tight text-muted-foreground">{label}</span>
    </button>
  );
}

const DataGlyph = ({ type }: { type: DotType }) => {
  const r =
    type === "dots"
      ? 4
      : type === "rounded" || type === "extra-rounded"
        ? 2.5
        : type === "classy" || type === "classy-rounded"
          ? 1.5
          : 0;
  const cells = [
    [1, 1],
    [11, 1],
    [1, 11],
    [11, 11],
  ];
  return (
    <svg viewBox="0 0 20 20" className="h-full w-full fill-current" aria-hidden>
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="8" height="8" rx={r} />
      ))}
    </svg>
  );
};

const OuterGlyph = ({ type }: { type: CornerSquareType }) => (
  <svg viewBox="0 0 20 20" className="h-full w-full" aria-hidden>
    <rect
      x="2"
      y="2"
      width="16"
      height="16"
      rx={type === "dot" ? 8 : type === "extra-rounded" ? 5 : 0}
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
    />
  </svg>
);

const InnerGlyph = ({ type }: { type: CornerDotType }) => (
  <svg viewBox="0 0 20 20" className="h-full w-full fill-current" aria-hidden>
    <rect x="5" y="5" width="10" height="10" rx={type === "dot" ? 5 : 0} />
  </svg>
);

/**
 * Granular shape control for the three independent sub-layers of the code:
 * data modules, outer finder frames and inner finder dots.
 */
export function CustomizeShapesModal(props: CustomizeShapesModalProps) {
  const {
    open,
    onOpenChange,
    bodyShape,
    onBodyShapeChange,
    dotStyle,
    onDotStyleChange,
    outerCornerStyle,
    onOuterCornerStyleChange,
    innerCornerStyle,
    onInnerCornerStyleChange,
    logoSize,
    onLogoSizeChange,
    logoMargin,
    onLogoMarginChange,
    hideBackgroundDots,
    onHideBackgroundDotsChange,
    hasLogo,
  } = props;

  const artistic = isArtisticPattern(bodyShape);

  const pickGeometric = (id: DotType) => {
    // Leaving an artistic mode returns the payload to the vector renderer.
    if (artistic) onBodyShapeChange("square");
    onDotStyleChange(id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="customize-shapes-modal"
        aria-labelledby="customize-shapes-title"
        className="p-0 sm:max-w-lg sm:rounded-3xl max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-t-3xl max-sm:rounded-b-none"
      >
        <DialogHeader className="px-5 pt-5">
          <DialogTitle id="customize-shapes-title">{trI18n.t("ui.35ccb6b556")}</DialogTitle>
          <DialogDescription className="text-xs">
            Control the three sub-layers of the code independently. The finder patterns stay
            mathematically isolated whatever you pick.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] px-5 pb-5">
          <div className="space-y-4">
            {/* Pattern — the master style for the whole code */}
            <section className="space-y-2">
              <p className="text-sm font-medium text-foreground">{trI18n.t("ui.1fff6a3166")}</p>
              <div className="grid grid-cols-5 gap-1.5">
                {PATTERNS.map((p) => (
                  <Chip
                    key={p.id}
                    label={p.label}
                    hint={p.hint}
                    testId={`studio-pattern-${p.id}`}
                    active={bodyShape === p.id}
                    onClick={() => onBodyShapeChange(p.id)}
                  >
                    <PatternGlyph pattern={p} />
                  </Chip>
                ))}
              </div>
            </section>

            {/* A — data modules */}
            <section className="space-y-2 border-t border-border/60 pt-4">
              <div>
                <p className="text-sm font-medium text-foreground">{trI18n.t("ui.6debb3756c")}</p>
                <p className="text-xs text-muted-foreground">{trI18n.t("ui.563fb4d538")}</p>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {DATA_SHAPES.map((o) => (
                  <Chip
                    key={o.id}
                    label={o.label}
                    active={!artistic && dotStyle === o.id}
                    onClick={() => pickGeometric(o.id)}
                  >
                    <DataGlyph type={o.id} />
                  </Chip>
                ))}
                {ARTISTIC_PATTERNS.map((p) => (
                  <Chip
                    key={p.id}
                    label={p.label}
                    hint={p.hint}
                    active={bodyShape === p.id}
                    onClick={() => onBodyShapeChange(p.id)}
                  >
                    <svg viewBox="0 0 20 20" className="h-full w-full fill-current" aria-hidden>
                      {p.id === "calligraphy" && (
                        <path d="M1 7 Q6 3 12 7 Q6 11 1 7z M8 14 Q13 10 19 14 Q13 18 8 14z" />
                      )}
                      {p.id === "ballpoint" && (
                        <>
                          <rect x="2" y="2" width="6" height="6" rx="1.5" />
                          <rect x="11" y="4" width="6" height="6" rx="1.5" />
                          <rect x="4" y="12" width="6" height="6" rx="1.5" />
                        </>
                      )}
                      {p.id === "chalk" && (
                        <>
                          <circle cx="6" cy="6" r="3.4" opacity="0.85" />
                          <circle cx="14" cy="8" r="3" opacity="0.7" />
                          <circle cx="8" cy="15" r="3.2" opacity="0.8" />
                        </>
                      )}
                      {p.id === "mesh" && (
                        <>
                          <circle cx="5" cy="5" r="2.4" />
                          <circle cx="15" cy="5" r="2.4" />
                          <circle cx="5" cy="15" r="2.4" />
                          <rect x="5" y="4" width="10" height="2" />
                          <rect x="4" y="5" width="2" height="10" />
                        </>
                      )}
                    </svg>
                  </Chip>
                ))}
              </div>
              {artistic && (
                <p className="text-[11px] text-muted-foreground">
                  Artistic mode locks error correction to level H (30% recovery) automatically.
                </p>
              )}
            </section>

            {/* B — outer finder frames */}
            <section className="space-y-2 border-t border-border/60 pt-4">
              <div>
                <p className="text-sm font-medium text-foreground">{trI18n.t("ui.5e37b0fd98")}</p>
                <p className="text-xs text-muted-foreground">{trI18n.t("ui.8f3f1c223e")}</p>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {OUTER_SHAPES.map((o) => (
                  <Chip
                    key={o.id}
                    label={o.label}
                    active={outerCornerStyle === o.id}
                    onClick={() => onOuterCornerStyleChange(o.id)}
                  >
                    <OuterGlyph type={o.id} />
                  </Chip>
                ))}
              </div>
            </section>

            {/* C — inner finder dots */}
            <section className="space-y-2 border-t border-border/60 pt-4">
              <div>
                <p className="text-sm font-medium text-foreground">{trI18n.t("ui.60ff89055b")}</p>
                <p className="text-xs text-muted-foreground">
                  The centre square inside each corner.
                </p>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {INNER_SHAPES.map((o) => (
                  <Chip
                    key={o.id}
                    label={o.label}
                    active={innerCornerStyle === o.id}
                    onClick={() => onInnerCornerStyleChange(o.id)}
                  >
                    <InnerGlyph type={o.id} />
                  </Chip>
                ))}
              </div>
            </section>

            {/* Centre slot */}
            <section className="space-y-3 border-t border-border/60 pt-4">
              <div>
                <p className="text-sm font-medium text-foreground">{trI18n.t("ui.8dddc4bc82")}</p>
                <p className="text-xs text-muted-foreground">
                  Reserved clean zone for a logo or monogram.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{trI18n.t("ui.716411e586")}</Label>
                  <span className="font-mono text-xs text-muted-foreground">
                    {Math.round(logoSize * 100)}%
                  </span>
                </div>
                <Slider
                  value={[logoSize]}
                  onValueChange={(v) => onLogoSizeChange(v[0])}
                  min={0.2}
                  max={0.6}
                  step={0.05}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{trI18n.t("ui.24eae0d0ab")}</Label>
                  <span className="font-mono text-xs text-muted-foreground">{logoMargin}px</span>
                </div>
                <Slider
                  value={[logoMargin]}
                  onValueChange={(v) => onLogoMarginChange(v[0])}
                  min={0}
                  max={30}
                  step={2}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs text-foreground">{trI18n.t("ui.18f4efb1f7")}</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Keeps scan reliability at ECC-H.
                  </p>
                </div>
                <Switch checked={hideBackgroundDots} onCheckedChange={onHideBackgroundDotsChange} />
              </div>
              {!hasLogo && (
                <p className="text-[11px] italic text-muted-foreground">
                  No logo uploaded yet — the slot stays invisible but is already reserved.
                </p>
              )}
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
