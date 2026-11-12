import { Input } from "@/components/ui/input";

interface FilenameInputProps {
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}

export function FilenameInput({ value, onChange, hint }: FilenameInputProps) {
  return (
    <div className="space-y-1.5">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[/\\?%*:|"<>]/g, ""))}
        placeholder="qrcode"
        className="h-11 rounded-xl bg-background input-field"
      />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
