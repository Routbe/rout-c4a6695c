import { InfoHint } from "@/components/InfoHint";
import { SelectedOptionCard } from "@/components/SelectionIndicator";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DPISelectorProps {
  // Output pixel size (square)
  pixelSize: number;
  onPixelSizeChange: (px: number) => void;
  physicalSize: number; // in mm
  onPhysicalSizeChange: (mm: number) => void;
  dpi: number;
  onDpiChange: (dpi: number) => void;
  unit: "mm" | "in";
  onUnitChange: (unit: "mm" | "in") => void;
}

const dpiPresets = [
  { value: 72, label: "72 — Screen" },
  { value: 150, label: "150 — Draft" },
  { value: 300, label: "300 — Print" },
  { value: 600, label: "600 — HQ Print" },
];

const sizePresets = [
  { mm: 25, label: "Sticker" },
  { mm: 55, label: "Card" },
  { mm: 100, label: "Flyer" },
  { mm: 200, label: "Poster" },
];

export function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi);
}

export function DPISelector({
  pixelSize,
  onPixelSizeChange,
  physicalSize,
  onPhysicalSizeChange,
  dpi,
  onDpiChange,
  unit,
  onUnitChange,
}: DPISelectorProps) {
  const displaySize = unit === "mm" ? physicalSize : +(physicalSize / 25.4).toFixed(2);

  const setPhysical = (val: number, u = unit) => {
    const mm = u === "mm" ? val : val * 25.4;
    onPhysicalSizeChange(mm);
    onPixelSizeChange(mmToPx(mm, dpi));
  };

  const setDpi = (d: number) => {
    onDpiChange(d);
    onPixelSizeChange(mmToPx(physicalSize, d));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <p className="text-sm font-medium text-foreground">Print size</p>
        <InfoHint label="About print size and DPI" className="ml-0.5">
          Your file exports at {pixelSize} × {pixelSize} pixels, which equals{" "}
          {physicalSize.toFixed(1)}mm printed at {dpi} DPI. Higher DPI means more dots per inch, so
          the printed code stays sharp.
        </InfoHint>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {sizePresets.map((p) => (
          <SelectedOptionCard
            key={p.mm}
            isSelected={Math.round(physicalSize) === p.mm}
            onSelect={() => setPhysical(p.mm, "mm")}
            className="rounded-2xl py-2.5 text-xs font-medium"
          >
            <div>{p.label}</div>
            <div className="text-[10px] text-muted-foreground">{p.mm}mm</div>
          </SelectedOptionCard>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-1 h-11 rounded-xl border border-border bg-background px-3">
          <Input
            type="number"
            min={5}
            max={2000}
            value={displaySize}
            onChange={(e) => setPhysical(Number(e.target.value))}
            className="h-9 border-0 p-0 shadow-none focus-visible:ring-0 text-sm"
          />
          <Select value={unit} onValueChange={(v) => onUnitChange(v as "mm" | "in")}>
            <SelectTrigger className="h-9 w-16 border-0 shadow-none px-1 text-xs focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mm">mm</SelectItem>
              <SelectItem value="in">in</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Select value={String(dpi)} onValueChange={(v) => setDpi(Number(v))}>
          <SelectTrigger className="h-11 rounded-xl bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {dpiPresets.map((p) => (
              <SelectItem key={p.value} value={String(p.value)}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-[11px] text-muted-foreground tabular-nums">
        {pixelSize} × {pixelSize}px
      </p>
    </div>
  );
}
