import { z } from "zod";

/** Intake questions per booking type (pure rules, shared by server and UI). */
export const intakeFieldType = z.enum(["text", "textarea", "select", "checkbox", "phone"]);
export const intakeField = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,32}$/),
  label: z.string().trim().min(1).max(120),
  type: intakeFieldType,
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  sensitive: z.boolean().default(false),
});
export type IntakeField = z.infer<typeof intakeField>;
export const intakeFields = z
  .array(intakeField)
  .max(20)
  .refine((f) => new Set(f.map((x) => x.id)).size === f.length, { message: "duplicate_field_id" })
  .refine((f) => f.every((x) => x.type !== "select" || x.options.length > 0), { message: "select_needs_options" });

export const MAX_ANSWER = { text: 300, phone: 32, textarea: 2000 } as const;
export type IntakeAnswers = Record<string, string | boolean>;

/** Validates raw answers against the field definitions; drops unknown keys. */
export function validateIntake(fields: IntakeField[], raw: Record<string, unknown> | null | undefined):
  | { ok: true; answers: IntakeAnswers }
  | { ok: false; fieldId: string } {
  const out: IntakeAnswers = {};
  for (const f of fields) {
    const v = raw?.[f.id];
    if (f.type === "checkbox") {
      if (v !== undefined && typeof v !== "boolean") return { ok: false, fieldId: f.id };
      if (f.required && v !== true) return { ok: false, fieldId: f.id };
      if (v !== undefined) out[f.id] = v;
      continue;
    }
    const s = typeof v === "string" ? v.trim() : v == null ? "" : null;
    if (s === null) return { ok: false, fieldId: f.id };
    if (!s) { if (f.required) return { ok: false, fieldId: f.id }; continue; }
    if (f.type === "select" && !f.options.includes(s)) return { ok: false, fieldId: f.id };
    if (f.type === "phone" && !/^\+?[0-9 ()-]{6,32}$/.test(s)) return { ok: false, fieldId: f.id };
    const max = f.type === "select" ? 80 : MAX_ANSWER[f.type];
    if (s.length > max) return { ok: false, fieldId: f.id };
    out[f.id] = s;
  }
  return { ok: true, answers: out };
}

/** Splits answers: sensitive ones are encrypted at rest, the rest stored as plain JSON. */
export function splitSensitive(fields: IntakeField[], answers: IntakeAnswers) {
  const plain: IntakeAnswers = {}, secret: IntakeAnswers = {};
  for (const [k, v] of Object.entries(answers)) (fields.find((f) => f.id === k)?.sensitive ? secret : plain)[k] = v;
  return { plain, secret };
}

/** A shared-capacity slot stays bookable while fewer than `capacity` active bookings hold it. */
export const seatsLeft = (capacity: number, taken: number) => Math.max(0, Math.max(1, capacity) - taken);
