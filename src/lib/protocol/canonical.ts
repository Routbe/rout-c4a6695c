/**
 * Deterministic JSON (RFC 8785 subset): object keys sorted by UTF-16 code
 * units, no whitespace, `undefined` members dropped. Only plain JSON values are
 * accepted: integers must be safe, non-finite numbers, functions, dates, maps
 * and class instances are rejected, so a signature can never cover a value two
 * runtimes would serialise differently.
 */
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const MAX_DEPTH = 32;

export function canonicalJson(value: unknown): string {
  return write(value, 0);
}

function write(v: unknown, depth: number): string {
  if (depth > MAX_DEPTH) throw new Error("canonical_too_deep");
  if (v === null) return "null";
  switch (typeof v) {
    case "boolean":
      return v ? "true" : "false";
    case "string":
      return JSON.stringify(v);
    case "number":
      if (!Number.isFinite(v)) throw new Error("canonical_non_finite");
      if (Number.isInteger(v) && !Number.isSafeInteger(v)) throw new Error("canonical_unsafe_integer");
      return JSON.stringify(v);
    case "object": {
      if (Array.isArray(v)) return `[${v.map((x) => write(x, depth + 1)).join(",")}]`;
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) throw new Error("canonical_not_plain");
      const keys = Object.keys(v as object)
        .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
        .sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${write((v as Record<string, unknown>)[k], depth + 1)}`).join(",")}}`;
    }
    default:
      throw new Error("canonical_unsupported");
  }
}
