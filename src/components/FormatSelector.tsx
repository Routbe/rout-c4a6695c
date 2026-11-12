import { SelectedOptionCard } from "@/components/SelectionIndicator";
import { useI18n } from "@/lib/i18n";

export type QRFormat = "png" | "svg" | "jpeg";

const formats: { id: QRFormat; label: string }[] = [
  { id: "png", label: "PNG" },
  { id: "svg", label: "SVG" },
  { id: "jpeg", label: "JPG" },
];

interface FormatSelectorProps {
  value: QRFormat;
  onChange: (value: QRFormat) => void;
}

export function FormatSelector({ value, onChange }: FormatSelectorProps) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-3 gap-2">
      {formats.map((f) => (
        <SelectedOptionCard
          key={f.id}
          isSelected={value === f.id}
          onSelect={() => onChange(f.id)}
          title={t(`format.${f.id}.hint`)}
          className="rounded-2xl px-4 py-3 text-sm font-medium"
        >
          {f.label}
        </SelectedOptionCard>
      ))}
    </div>
  );
}
