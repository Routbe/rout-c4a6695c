import { z } from "zod";

const identifier = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).max(100);
const row = z.record(identifier, z.unknown()).refine((value) => Object.keys(value).length <= 100);
export const querySchema = z.object({
  table: identifier,
  action: z.enum(["select", "insert", "update", "upsert", "delete"]),
  columns: z.string().max(2000),
  values: z.union([row, z.array(row).max(100)]).optional(),
  onConflict: z.string().max(200).optional(),
  ignoreDuplicates: z.boolean().optional(),
  filters: z.array(z.object({ op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in", "contains", "or", "not"]), column: z.string().max(100), value: z.unknown(), negatedOp: z.string().max(20).optional() })).max(100),
  order: z.array(z.object({ column: identifier, ascending: z.boolean(), nullsFirst: z.boolean().optional() })).max(20),
  limit: z.number().int().min(0).max(10000).optional(),
  range: z.object({ from: z.number().int().min(0), to: z.number().int().min(0) }).refine((range) => range.to >= range.from && range.to - range.from < 10000).optional(),
  count: z.enum(["exact", "planned", "estimated"]).optional(),
  head: z.boolean().optional(),
  rowMode: z.enum(["single", "maybe"]).optional(),
  returning: z.boolean(),
}).superRefine((value, ctx) => {
  if (value.action === "update" && Array.isArray(value.values)) {
    ctx.addIssue({ code: "custom", message: "An update requires a single row", path: ["values"] });
  }
});