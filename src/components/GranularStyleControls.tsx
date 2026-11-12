import type { JSX } from "react";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { DotType, CornerSquareType, CornerDotType } from "qr-code-styling";

interface GranularStyleControlsProps {
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
  color: string;
}

const dotOptions: { id: DotType; label: string }[] = [
  { id: "square", label: "Square" },
  { id: "dots", label: "Dots" },
  { id: "rounded", label: "Rounded" },
  { id: "extra-rounded", label: "X-Round" },
  { id: "classy", label: "Classy" },
  { id: "classy-rounded", label: "Classy R" },
];

const outerOptions: { id: CornerSquareType; label: string }[] = [
  { id: "square", label: "Square" },
  { id: "dot", label: "Dot" },
  { id: "extra-rounded", label: "Rounded" },
];

const innerOptions: { id: CornerDotType; label: string }[] = [
  { id: "square", label: "Square" },
  { id: "dot", label: "Dot" },
];

// SVG previews rendered inline with current fg color
function DotPreview({ type, color }: { type: DotType; color: string }) {
  const cells: Record<DotType, JSX.Element> = {
    square: (
      <g fill={color}>
        <rect x="2" y="2" width="7" height="7" />
        <rect x="11" y="2" width="7" height="7" />
        <rect x="20" y="2" width="7" height="7" />
        <rect x="2" y="11" width="7" height="7" />
        <rect x="20" y="11" width="7" height="7" />
        <rect x="2" y="20" width="7" height="7" />
        <rect x="11" y="20" width="7" height="7" />
      </g>
    ),
    dots: (
      <g fill={color}>
        <circle cx="5.5" cy="5.5" r="3.5" />
        <circle cx="14.5" cy="5.5" r="3.5" />
        <circle cx="23.5" cy="5.5" r="3.5" />
        <circle cx="5.5" cy="14.5" r="3.5" />
        <circle cx="23.5" cy="14.5" r="3.5" />
        <circle cx="5.5" cy="23.5" r="3.5" />
        <circle cx="14.5" cy="23.5" r="3.5" />
      </g>
    ),
    rounded: (
      <g fill={color}>
        <rect x="2" y="2" width="7" height="7" rx="2" />
        <rect x="11" y="2" width="7" height="7" rx="2" />
        <rect x="20" y="2" width="7" height="7" rx="2" />
        <rect x="2" y="11" width="7" height="7" rx="2" />
        <rect x="20" y="11" width="7" height="7" rx="2" />
        <rect x="2" y="20" width="7" height="7" rx="2" />
        <rect x="11" y="20" width="7" height="7" rx="2" />
      </g>
    ),
    "extra-rounded": (
      <g fill={color}>
        <rect x="2" y="2" width="7" height="7" rx="3.5" />
        <rect x="11" y="2" width="7" height="7" rx="3.5" />
        <rect x="20" y="2" width="7" height="7" rx="3.5" />
        <rect x="2" y="11" width="7" height="7" rx="3.5" />
        <rect x="20" y="11" width="7" height="7" rx="3.5" />
        <rect x="2" y="20" width="7" height="7" rx="3.5" />
        <rect x="11" y="20" width="7" height="7" rx="3.5" />
      </g>
    ),
    classy: (
      <g fill={color}>
        <path d="M2 5 Q2 2 5 2 L9 2 L9 9 L2 9 Z" />
        <path d="M11 5 Q11 2 14 2 L18 2 L18 9 L11 9 Z" />
        <path d="M20 5 Q20 2 23 2 L27 2 L27 9 L20 9 Z" />
        <path d="M2 14 Q2 11 5 11 L9 11 L9 18 L2 18 Z" />
        <path d="M20 14 Q20 11 23 11 L27 11 L27 18 L20 18 Z" />
        <path d="M2 23 Q2 20 5 20 L9 20 L9 27 L2 27 Z" />
        <path d="M11 23 Q11 20 14 20 L18 20 L18 27 L11 27 Z" />
      </g>
    ),
    "classy-rounded": (
      <g fill={color}>
        <path d="M2 5 Q2 2 5 2 L9 2 Q9 9 2 9 Z" />
        <path d="M11 5 Q11 2 14 2 L18 2 Q18 9 11 9 Z" />
        <path d="M20 5 Q20 2 23 2 L27 2 Q27 9 20 9 Z" />
        <path d="M2 14 Q2 11 5 11 L9 11 Q9 18 2 18 Z" />
        <path d="M20 14 Q20 11 23 11 L27 11 Q27 18 20 18 Z" />
        <path d="M2 23 Q2 20 5 20 L9 20 Q9 27 2 27 Z" />
        <path d="M11 23 Q11 20 14 20 L18 20 Q18 27 11 27 Z" />
      </g>
    ),
  };
  return (
    <svg viewBox="0 0 29 29" className="w-full h-full">
      {cells[type]}
    </svg>
  );
}

function OuterPreview({ type, color }: { type: CornerSquareType; color: string }) {
  const rx = type === "square" ? 0 : type === "dot" ? 14 : 6;
  return (
    <svg viewBox="0 0 28 28" className="w-full h-full">
      <rect x="2" y="2" width="24" height="24" rx={rx} fill="none" stroke={color} strokeWidth="4" />
    </svg>
  );
}

function InnerPreview({ type, color }: { type: CornerDotType; color: string }) {
  const rx = type === "square" ? 0 : 14;
  return (
    <svg viewBox="0 0 28 28" className="w-full h-full">
      <rect x="6" y="6" width="16" height="16" rx={rx} fill={color} />
    </svg>
  );
}

interface RowProps<T extends string> {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  renderPreview: (id: T) => JSX.Element;
}

function StyleRow<T extends string>({ options, value, onChange, renderPreview }: RowProps<T>) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={cn(
            "aspect-square p-2 rounded-2xl transition-all duration-200 flex items-center justify-center border",
            value === opt.id
              ? "gradient-border-selected"
              : "border-border bg-background hover:bg-muted/60",
          )}
          title={opt.label}
        >
          {renderPreview(opt.id)}
        </button>
      ))}
    </div>
  );
}

export function GranularStyleControls({
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
  color,
}: GranularStyleControlsProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">Dot style</p>
        <StyleRow
          options={dotOptions}
          value={dotStyle}
          onChange={onDotStyleChange}
          renderPreview={(id) => <DotPreview type={id} color={color} />}
        />
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">Outer corners</p>
        <p className="text-xs text-muted-foreground -mt-1">
          The three finder frames at the QR corners.
        </p>
        <StyleRow
          options={outerOptions}
          value={outerCornerStyle}
          onChange={onOuterCornerStyleChange}
          renderPreview={(id) => <OuterPreview type={id} color={color} />}
        />
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">Inner corners</p>
        <p className="text-xs text-muted-foreground -mt-1">
          The dot in the center of each finder frame.
        </p>
        <StyleRow
          options={innerOptions}
          value={innerCornerStyle}
          onChange={onInnerCornerStyleChange}
          renderPreview={(id) => <InnerPreview type={id} color={color} />}
        />
      </div>

      <div className="space-y-4 pt-2 border-t border-border/60">
        <div>
          <p className="text-sm font-medium text-foreground">Center slot</p>
          <p className="text-xs text-muted-foreground mt-1">
            Reserves a clean zone in the middle of the code — for logos, monograms or a brand mark.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Slot size</Label>
            <span className="text-xs font-mono text-muted-foreground">
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
            <Label className="text-xs text-muted-foreground">Slot padding</Label>
            <span className="text-xs font-mono text-muted-foreground">{logoMargin}px</span>
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
            <Label className="text-xs text-foreground">Hide dots behind logo</Label>
            <p className="text-[11px] text-muted-foreground">Keeps scan reliability at ECC-H.</p>
          </div>
          <Switch checked={hideBackgroundDots} onCheckedChange={onHideBackgroundDotsChange} />
        </div>

        {!hasLogo && (
          <p className="text-[11px] text-muted-foreground italic">
            No logo uploaded yet — the slot stays invisible but is already reserved for scan safety.
          </p>
        )}
      </div>
    </div>
  );
}
