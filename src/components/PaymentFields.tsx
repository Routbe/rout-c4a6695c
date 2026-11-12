import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InfoHint } from "@/components/InfoHint";
import { getPaymentMethod, validateIban } from "@/lib/payments";
import { cn } from "@/lib/utils";

interface PaymentFieldsProps {
  methodId: string;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

const inputClassName = "h-12 rounded-xl bg-background border-border input-field";
const labelClassName = "input-label";

export function PaymentFields({ methodId, values, onChange }: PaymentFieldsProps) {
  const method = getPaymentMethod(methodId);
  if (!method) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="input-label">{method.label}</span>
        <InfoHint label={`About ${method.label}`}>{method.hint}</InfoHint>
      </div>

      {method.region === "europe" && (
        <p className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          💡 Payconiq has merged into Wero &amp; Bancontact Pay. EPC/SEPA codes remain 100% open and
          free forever.
        </p>
      )}

      {method.fields.map((field) => {
        const value = values[field.key] ?? "";
        const ibanError = field.key === "iban" ? validateIban(value) : null;
        return (
          <div key={field.key} className="space-y-2">
            <label className={labelClassName}>
              {field.label}
              {field.optional && (
                <span className="text-muted-foreground font-normal"> (optional)</span>
              )}
            </label>
            {field.type === "select" ? (
              <Select
                value={value || field.options?.[0]?.value || ""}
                onValueChange={(v) => onChange(field.key, v)}
              >
                <SelectTrigger className="h-12 rounded-xl bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border z-50">
                  {field.options?.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                type={field.type === "number" ? "number" : "text"}
                inputMode={field.type === "number" ? "decimal" : undefined}
                min={field.type === "number" ? "0" : undefined}
                step={field.type === "number" ? "0.01" : undefined}
                placeholder={field.placeholder}
                value={value}
                aria-invalid={Boolean(ibanError)}
                onChange={(e) =>
                  onChange(
                    field.key,
                    field.uppercase ? e.target.value.toUpperCase() : e.target.value,
                  )
                }
                className={cn(inputClassName, ibanError && "border-destructive")}
              />
            )}
            {ibanError ? (
              <p role="alert" className="text-xs text-destructive">
                {ibanError}
              </p>
            ) : field.key === "iban" && value ? (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">Valid IBAN.</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
