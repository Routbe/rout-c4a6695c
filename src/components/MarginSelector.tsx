import { InfoHint } from "@/components/InfoHint";
import { SelectedOptionCard } from "@/components/SelectionIndicator";

/**
 * Presets are px at the 650 px working size. 72 px lands on the ISO/IEC 18004
 * 4-module quiet zone for a typical 29-module code, so it is the safe default.
 */
const presets = [
  { px: 0, label: "None" },
  { px: 20, label: "Tight" },
  { px: 40, label: "Medium" },
  { px: 72, label: "Safe" },
];

interface MarginSelectorProps {
  value: number;
  onChange: (value: number) => void;
}

export function MarginSelector({ value, onChange }: MarginSelectorProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <p className="text-sm font-medium text-foreground">Quiet zone</p>
        <InfoHint label="About the quiet zone" className="ml-0.5">
          Extra white space around the QR. Printed codes scan better with a larger quiet zone.
        </InfoHint>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {presets.map((p) => (
          <SelectedOptionCard
            key={p.px}
            isSelected={value === p.px}
            onSelect={() => onChange(p.px)}
            className="rounded-2xl py-3 text-sm font-medium"
          >
            {p.label}
          </SelectedOptionCard>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={120}

          step={2}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-foreground"
          aria-label="Quiet-zone margin"
        />
        <span className="text-xs text-muted-foreground w-14 text-right tabular-nums">
          {value}px
        </span>
      </div>
    </div>
  );
}
