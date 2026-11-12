/**
 * Pure classification of Studio draft-save failures. Server and client share it
 * so every failure reaches the UI as a structured `{ code, status }` instead of
 * a bare 500 or a raw database message.
 */
export type SaveErrorCode =
  | "session_expired"
  | "validation_failed"
  | "db_unavailable"
  | "db_timeout"
  | "conflict"
  | "network"
  | "unknown";

export interface SaveErrorInfo {
  code: SaveErrorCode;
  status: number;
  /** Short technical detail (never contains user content or tokens). */
  detail: string;
  at: string;
}

const MAX_DETAIL = 300;

export function classifySaveError(raw: unknown, now: Date = new Date()): SaveErrorInfo {
  const message = (raw instanceof Error ? raw.message : typeof raw === "string" ? raw : "").trim();
  const m = message.toLowerCase();
  const pick = (code: SaveErrorCode, status: number): SaveErrorInfo => ({
    code,
    status,
    detail: message.slice(0, MAX_DETAIL) || code,
    at: now.toISOString(),
  });
  if (!message) return pick("unknown", 500);
  if (m === "unauthorized" || m.includes("session") || m.includes("account_sunset")) return pick("session_expired", 401);
  if (m.includes("draft_conflict")) return pick("conflict", 409);
  if (m.startsWith("validation") || m.includes("invalid_type") || m.includes("too_big") || m.includes("unrecognized_keys") || m.startsWith("handle_")) {
    return pick("validation_failed", 422);
  }
  if (m.includes("timeout") || m.includes("timed out") || m.includes("statement_timeout") || m.includes("canceling statement")) {
    return pick("db_timeout", 504);
  }
  if (m.includes("database") || m.includes("econnrefused") || m.includes("connection") || m.includes("neon") || m.includes("too many clients")) {
    return pick("db_unavailable", 503);
  }
  if (m.includes("failed to fetch") || m.includes("fetch failed") || m.includes("networkerror") || m.includes("network error") || m.includes("load failed") || m.includes("network request failed")) return pick("network", 0);
  return pick("unknown", 500);
}

/** Server failures worth an automatic admin email (user mistakes and conflicts are not). */
export function isCriticalSaveError(code: SaveErrorCode): boolean {
  return code === "db_unavailable" || code === "db_timeout" || code === "unknown";
}

/** Automatic reports: at most one mail per error type per 15 minutes. */
export const AUTO_REPORT_RULE = { limit: 1, windowSec: 15 * 60 } as const;
