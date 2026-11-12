import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { MAX_ANSWER, type IntakeField, type IntakeAnswers } from "@/lib/booking-engine/intake";

export function IntakeForm({ fields, answers, onChange }: {
  fields: IntakeField[]; answers: IntakeAnswers; onChange: (answers: IntakeAnswers) => void;
}) {
  return fields.map((field) => {
    const id = `bk-intake-${field.id}`;
    const value = typeof answers[field.id] === "string" ? String(answers[field.id]) : "";
    const change = (next: string | boolean) => onChange({ ...answers, [field.id]: next });
    if (field.type === "checkbox") return (
      <div key={field.id} className="flex items-start gap-2">
        <Checkbox id={id} checked={answers[field.id] === true} onCheckedChange={(checked) => change(checked === true)} />
        <Label htmlFor={id} className="min-w-0 break-words leading-5">{field.label}{field.required && " *"}</Label>
      </div>
    );
    return (
      <div key={field.id} className="space-y-1.5">
        <Label htmlFor={id} className="break-words">{field.label}{field.required && " *"}</Label>
        {field.type === "select" ? (
          <select id={id} required={field.required} value={value} onChange={(e) => change(e.target.value)} className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground">
            <option value="">—</option>
            {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        ) : field.type === "textarea" ? (
          <Textarea id={id} required={field.required} rows={3} maxLength={MAX_ANSWER.textarea} value={value} onChange={(e) => change(e.target.value)} />
        ) : (
          <Input id={id} required={field.required} type={field.type === "phone" ? "tel" : "text"} maxLength={field.type === "phone" ? MAX_ANSWER.phone : MAX_ANSWER.text} value={value} onChange={(e) => change(e.target.value)} />
        )}
      </div>
    );
  });
}