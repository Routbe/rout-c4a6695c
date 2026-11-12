/**
 * Compiler-grade diagnostics for agent APIs: every validation failure names
 * the exact JSON path, the rejected value and a JSON-Patch the agent can apply
 * to fix the request. Pure; never echoes values longer than 200 characters.
 */
import type { ZodError } from "zod";
import * as tokens from "@/lib/vault/design-tokens";

export interface AgentDiagnostic {
  error_code: string;
  path: string;
  rejected_value: unknown;
  message: string;
  suggested_mutation: { op: "remove" | "replace" | "add" | "move"; path: string; value?: unknown; from?: string } | null;
}


const pointer = (path: (string | number)[]) => "/" + path.map((p) => String(p).replace(/~/g, "~0").replace(/\//g, "~1")).join("/");
const dotted = (path: (string | number)[]) => (path.length ? path.map(String).join(".") : "body");

function valueAt(body: unknown, path: (string | number)[]): unknown {
  let cur: unknown = body;
  for (const key of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return cur;
}

function safeEcho(v: unknown): unknown {
  if (typeof v === "string") return v.length > 200 ? `${v.slice(0, 200)}…` : v;
  if (v == null || typeof v === "number" || typeof v === "boolean") return v;
  return Array.isArray(v) ? `[array(${v.length})]` : "[object]";
}

const slug = (v: unknown) =>
  typeof v === "string" ? v.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || null : null;

export function diagnose(error: ZodError, body: unknown): AgentDiagnostic[] {
  const out: AgentDiagnostic[] = [];
  for (const issue of error.issues.slice(0, 20)) {
    const raw = issue as unknown as { code: string; keys?: string[]; maximum?: number | bigint; values?: unknown[]; options?: unknown[]; expected?: string };
    if (raw.code === "unrecognized_keys" && raw.keys) {
      for (const key of raw.keys) {
        const p = [...issue.path, key] as (string | number)[];
        const parent = issue.path as (string | number)[];
        const inDesign = parent.some((s) => s === "canvas");
        const rename = inDesign ? tokens.suggestTokenKey(key) : null;
        const siblings = valueAt(body, parent);
        const free = rename && !(siblings && typeof siblings === "object" && rename in (siblings as object));
        out.push({
          error_code: inDesign ? "unknown_design_token" : "unknown_field",
          path: dotted(p),
          rejected_value: safeEcho(valueAt(body, p)),
          message: free ? `Unknown field "${key}". Did you mean "${rename}"?` : `Unknown field "${key}".`,
          suggested_mutation: free ? { op: "move", from: pointer(p), path: pointer([...parent, rename]) } : { op: "remove", path: pointer(p) },
        });
      }
      continue;
    }
    const path = issue.path as (string | number)[];
    const rejected = valueAt(body, path);
    let code = "invalid_value";
    let fix: AgentDiagnostic["suggested_mutation"] = null;
    const choices = raw.values ?? raw.options;
    if (issue.message === tokens.HEX_COLOR_MESSAGE) {
      const last = String(path[path.length - 1] ?? "");
      out.push({
        error_code: "invalid_design_token",
        path: dotted(path),
        rejected_value: safeEcho(rejected),
        message: "Colours must be 6-digit hex: #RRGGBB.",
        suggested_mutation: { op: "replace", path: pointer(path), value: tokens.normalizeHexColor(rejected) ?? tokens.fallbackColor(last) },
      });
      continue;
    }
    if (raw.code === "invalid_value" && Array.isArray(choices) && choices.length) {
      code = "invalid_enum";
      fix = { op: "replace", path: pointer(path), value: choices[0] };
    } else if (raw.code === "too_big" && typeof rejected === "string" && raw.maximum != null) {
      code = "too_long";
      fix = { op: "replace", path: pointer(path), value: rejected.slice(0, Number(raw.maximum)) };
    } else if (raw.code === "too_big" && Array.isArray(rejected) && raw.maximum != null) {
      code = "too_many_items";
      fix = { op: "replace", path: pointer(path), value: `[first ${Number(raw.maximum)} items]` };
    } else if (raw.code === "invalid_format" || (raw.code === "invalid_string")) {
      code = "invalid_design_token";
      const s = slug(rejected);
      if (s) fix = { op: "replace", path: pointer(path), value: s };
    } else if (raw.code === "too_small" && typeof rejected === "number" && (raw as { minimum?: number }).minimum != null) {
      code = "out_of_range";
      fix = { op: "replace", path: pointer(path), value: Number((raw as { minimum?: number }).minimum) };
    } else if (raw.code === "too_big" && typeof rejected === "number" && raw.maximum != null) {
      code = "out_of_range";
      fix = { op: "replace", path: pointer(path), value: Number(raw.maximum) };
    } else if (raw.code === "invalid_type") {
      code = rejected === undefined ? "missing_field" : "wrong_type";
      const last = String(path[path.length - 1] ?? "");
      const isColor = path.includes("theme") && ["background", "text", "accent", "card"].includes(last);
      if (isColor) fix = { op: rejected === undefined ? "add" : "replace", path: pointer(path), value: tokens.normalizeHexColor(rejected) ?? tokens.fallbackColor(last) };
      else if (rejected !== undefined && path.length) fix = { op: "remove", path: pointer(path) };
    } else if (raw.code === "custom") {
      code = "rule_violation";
    }
    out.push({ error_code: code, path: dotted(path), rejected_value: safeEcho(rejected), message: issue.message, suggested_mutation: fix });
  }
  // A missing field that a suggested rename already fills is not a separate problem.
  const moveTargets = new Set(out.flatMap((d) => (d.suggested_mutation?.op === "move" ? [d.suggested_mutation.path] : [])));
  return out.filter((d) => !(d.error_code === "missing_field" && d.suggested_mutation && moveTargets.has(d.suggested_mutation.path)));
}

/** Shared 400 body: `diagnostics` lists every problem; the first is also flattened for simple agents. */
export function diagnosticBody(error: ZodError, body: unknown): Record<string, unknown> {
  return diagnosticsBody(diagnose(error, body));
}

/** Same shape for diagnostics produced outside Zod (semantic rules, malformed JSON, size). */
export function diagnosticsBody(diagnostics: AgentDiagnostic[]): Record<string, unknown> {
  const first = diagnostics[0];
  return { ...(first ?? {}), diagnostics, retry_hint: "Apply each suggested_mutation (RFC 6902 JSON Patch) to your request body and resend." };
}
