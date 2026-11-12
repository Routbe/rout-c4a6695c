import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";
import { SelectionIndicator, selectionCardClass } from "@/components/SelectionIndicator";
import { NoneGlyph } from "@/components/NoneGlyph";
import {
  FRAMES,
  FRAME_CATEGORIES,
  FrameCategory,
  FrameDef,
  findFrame,
  FRAME_FONTS,
  frameFontStack,
  applyFrameTweaks,
  DEFAULT_FRAME_TWEAKS,
  type FrameTweaks,
} from "./QRFrames";

/**
 * Ready-made callout labels, grouped by use case. Both Dutch and English
 * wordings are offered because most ROUT codes end up in bilingual venues.
 */
const LABEL_GROUPS: { id: string; label: string; items: string[] }[] = [
  {
    id: "dining",
    label: "Dining",
    items: [
      "SCAN TO ORDER",
      "SCAN OM TE BESTELLEN",
      "SCAN FOR MENU",
      "SCAN VOOR MENU",
      "ORDER AT TABLE",
      "BESTEL AAN TAFEL",
      "SEE OUR MENU",
      "BEKIJK ONS MENU",
      "PAY HERE",
      "BETAAL HIER",
      "WIFI & PASSWORD",
      "WIFI & WACHTWOORD",
      "WIFI PASSWORD",
    ],
  },
  {
    id: "cta",
    label: "Call to action",
    items: ["SCAN ME", "SCAN MIJ", "TAP & SCAN", "MORE INFO", "MEER INFO", "MORE INFORMATION"],
  },
  {
    id: "social",
    label: "Social",
    items: [
      "FOLLOW US",
      "VOLG ONS",
      "OUR WEBSITE",
      "ONZE WEBSITE",
      "INSTAGRAM",
      "FACEBOOK",
      "LINKEDIN",
    ],
  },
  {
    id: "business",
    label: "Business",
    items: [
      "OUR LOCATION",
      "ONZE LOCATIE",
      "CONTACT",
      "LEAVE A REVIEW",
      "LAAT EEN REVIEW ACHTER",
      "DONATE",
      "DONEER",
    ],
  },
];

interface FrameLibraryProps {
  selectedFrameId: string | null;
  onFrameChange: (id: string | null) => void;
  frameLabel: string;
  onFrameLabelChange: (label: string) => void;
  frameFont?: string;
  onFrameFontChange?: (id: string) => void;
  frameTweaks?: FrameTweaks;
  onFrameTweaksChange?: (tweaks: FrameTweaks) => void;
  fgColor: string;
  bgColor: string;
}

export function FrameLibrary({
  selectedFrameId,
  onFrameChange,
  frameLabel,
  onFrameLabelChange,
  frameFont = "sans",
  onFrameFontChange,
  frameTweaks = DEFAULT_FRAME_TWEAKS,
  onFrameTweaksChange,
  fgColor,
  bgColor,
}: FrameLibraryProps) {
  const { t } = useI18n();
  // Default to the Standard set: it is the most useful starting point and the
  // "All" grid was overwhelming on first open.
  const [category, setCategory] = useState<FrameCategory>("standard");
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const visible: FrameDef[] =
    category === "all" ? FRAMES : FRAMES.filter((f) => f.category === category);
  // Only surface categories that actually hold frames, so filtering never
  // lands the user on an empty grid.
  const categories = FRAME_CATEGORIES.filter(
    (c) => c.id === "all" || FRAMES.some((f) => f.category === c.id),
  );

  const selected = findFrame(selectedFrameId);
  const effectiveBg = bgColor === "transparent" ? "#FFFFFF" : bgColor;
  const setTweak = (patch: Partial<FrameTweaks>) =>
    onFrameTweaksChange?.({ ...frameTweaks, ...patch });

  return (
    <div className="space-y-3">
      {/* Header — mirrors the Pattern section: label left, fine-tune right */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">Kaderstijl</p>
        <button
          type="button"
          data-testid="customize-frame-trigger"
          onClick={() => setCustomizeOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <SlidersHorizontal className="h-3 w-3" aria-hidden />
          Kader aanpassen
        </button>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onFrameChange(null)}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 h-7 rounded-full text-[11px] font-medium transition-all border",
            !selectedFrameId
              ? "bg-foreground text-background border-foreground"
              : "border-border bg-background text-muted-foreground hover:bg-[#F5F5F5]/50",
          )}
        >
          <NoneGlyph
            size="sm"
            className={cn(
              "h-3.5 w-3.5",
              !selectedFrameId && "border-background/40 bg-transparent text-background",
            )}
          />
          Geen
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={cn(
              "px-3 h-7 rounded-full text-[11px] font-medium transition-all border",
              category === c.id
                ? "gradient-border-selected text-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-[#F5F5F5]/50",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Frame grid */}
      <div className="grid grid-cols-4 gap-1.5">
        {visible.map((f) => {
          const active = selectedFrameId === f.id;
          const svg = applyFrameTweaks(
            f.render({
              color: fgColor,
              bg: effectiveBg,
              label: frameLabel || f.defaultLabel,
              font: frameFontStack(frameFont) ?? undefined,
            }),
            frameTweaks,
          );
          return (
            <div key={f.id} className="relative">
              <SelectionIndicator visible={active} />
              <button
                type="button"
                onClick={() => onFrameChange(f.id)}
                className={selectionCardClass(active, "aspect-[4/5] w-full rounded-2xl p-2")}
                aria-label={f.name}
                aria-pressed={active}
                title={f.name}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            </div>
          );
        })}
      </div>

      {/* Quick badges: one tap sets a proven call-to-action. */}
      {selected && (
        <div className="space-y-2 pt-1">
          <Label className="text-sm text-muted-foreground">{t("style.frameText")}</Label>
          <div className="max-h-44 space-y-2.5 overflow-y-auto rounded-2xl border border-border/70 bg-muted/20 p-2.5">
            {LABEL_GROUPS.map((group) => (
              <div key={group.id} className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {group.items.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => onFrameLabelChange(preset)}
                      aria-pressed={frameLabel === preset}
                      className={selectionCardClass(
                        frameLabel === preset,
                        "h-7 rounded-full px-2.5 text-[11px] font-medium tracking-wide",
                      )}
                    >
                      <SelectionIndicator visible={frameLabel === preset} />
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Advanced frame fine-tuning */}
      <Dialog open={customizeOpen} onOpenChange={setCustomizeOpen}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>Kader aanpassen</DialogTitle>
            <DialogDescription>
              Verfijn de rand, tekst en typografie van het geselecteerde kader.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">{t("style.frameText")}</Label>
              <Input
                value={frameLabel}
                onChange={(e) => onFrameLabelChange(e.target.value)}
                placeholder={selected?.defaultLabel ?? "SCAN ME"}
                className="h-11 rounded-xl bg-background border-border input-field"
                maxLength={40}
              />
              <p className="text-[11px] text-muted-foreground">{t("style.frameTextHint")}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground">Randdikte</Label>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {frameTweaks.stroke.toFixed(1)}×
                </span>
              </div>
              <Slider
                min={0.5}
                max={3}
                step={0.1}
                value={[frameTweaks.stroke]}
                onValueChange={([v]) => setTweak({ stroke: v })}
                aria-label="Kader randdikte"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground">Hoekronding</Label>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {frameTweaks.radius.toFixed(1)}×
                </span>
              </div>
              <Slider
                min={0}
                max={2}
                step={0.1}
                value={[frameTweaks.radius]}
                onValueChange={([v]) => setTweak({ radius: v })}
                aria-label="Kader hoekronding"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground">Tekstruimte</Label>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {frameTweaks.labelShift > 0 ? "+" : ""}
                  {frameTweaks.labelShift}
                </span>
              </div>
              <Slider
                min={-24}
                max={24}
                step={1}
                value={[frameTweaks.labelShift]}
                onValueChange={([v]) => setTweak({ labelShift: v })}
                aria-label="Kader tekstruimte"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">{t("style.frameFont")}</Label>
              <div className="flex flex-wrap gap-1.5">
                {FRAME_FONTS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => onFrameFontChange?.(f.id)}
                    style={{ fontFamily: f.stack }}
                    aria-pressed={frameFont === f.id}
                    className={selectionCardClass(
                      frameFont === f.id,
                      "h-8 rounded-full px-3 text-xs",
                    )}
                  >
                    <SelectionIndicator visible={frameFont === f.id} />
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onFrameTweaksChange?.(DEFAULT_FRAME_TWEAKS)}
              className="text-[11px] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Kaderaanpassingen resetten
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
