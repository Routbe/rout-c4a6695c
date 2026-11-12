/**
 * Server-only onboarding helpers: handle normalisation, availability checks,
 * name → handle suggestion and the dev-only super-admin bootstrap.
 */

import { sql } from "@/lib/neon";
import { RESERVED_SLUGS } from "./reserved-slugs";
import { sanitizeHandleInput } from "@/lib/validations/sanitizeHandle";

const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
const RESERVED = RESERVED_SLUGS;

export function normalizeHandle(raw: string) {
  return sanitizeHandleInput(raw);
}

/** Coarse per-handle throttle (memory-local): at most one probe per 300 ms. */
const lastSeen = new Map<string, number>();
export function throttle(key: string, windowMs = 300) {
  const now = Date.now();
  const prev = lastSeen.get(key);
  if (prev && now - prev < windowMs) return false;
  lastSeen.set(key, now);
  if (lastSeen.size > 5000) lastSeen.clear();
  return true;
}

/**
 * `code` is a stable, translation-friendly reason; `reason` stays as the
 * English fallback copy for API consumers and older callers.
 */
export type HandleAvailabilityCode =
  "empty" | "too_short" | "too_long" | "charset" | "reserved" | "rules" | "taken";

export type HandleAvailability = {
  ok: boolean;
  normalized: string;
  reason?: string;
  code?: HandleAvailabilityCode;
};

export async function isHandleFree(normalized: string): Promise<HandleAvailability> {
  if (!normalized) return { ok: false, normalized, code: "empty", reason: "Pick a handle." };
  if (normalized.length < 3)
    return { ok: false, normalized, code: "too_short", reason: "At least 3 characters." };
  if (normalized.length > 120)
    return { ok: false, normalized, code: "too_long", reason: "Maximum 120 characters." };
  if (!HANDLE_PATTERN.test(normalized)) {
    return {
      ok: false,
      normalized,
      code: "charset",
      reason: "Use a–z, 0–9, dot, dash or underscore; start and end alphanumeric.",
    };
  }
  if (RESERVED.has(normalized)) {
    return {
      ok: false,
      normalized,
      code: "reserved",
      reason: "This handle is reserved by the platform.",
    };
  }
  // < 3 too short, 3–4 reserved for VIP grants, 5+ open to everyone.
  const { handleRuleMessage } = await import("./handle-rules");
  const lengthIssue = handleRuleMessage(normalized, { tier: "free" });
  if (lengthIssue) {
    return { ok: false, normalized, code: "rules", reason: lengthIssue };
  }

  // Public availability probe: never depend on an auth session, and never
  // block sign-up if the query is slow or fails.
  try {
    const rows = (await sql`
      select id from public.profiles where lower(username) = ${normalized} limit 1
    `) as Record<string, unknown>[];
    if (rows.length > 0) return { ok: false, normalized, code: "taken", reason: "Already taken." };
  } catch {
    return { ok: true, normalized };
  }
  return { ok: true, normalized };
}

/** "Jona De Vries" / "jona.delplanche@gmail.com" → "jona.devries" style base. */
function handleBase(raw: string): string {
  return (
    normalizeHandle(raw)
      .split("@")[0]!
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "")
      .replace(/\.{2,}/g, ".")
      .slice(0, 32) || "rout.user"
  );
}

/** Two random digits — the free tier always carries a numeric discriminator. */
function twoDigits(): string {
  return String(Math.floor(10 + Math.random() * 90));
}

/**
 * Free-tier suggestion: base + 2 digits (e.g. `jona.delplanche48`), retried
 * with fresh digits until the handle is actually free in the database.
 * Free handles must contain at least 2 digits, so a bare base is never valid.
 */
export async function suggestFreeHandle(nameOrEmail: string) {
  const base = handleBase(nameOrEmail);

  for (let i = 0; i < 25; i += 1) {
    const candidate = `${base}${twoDigits()}`;

    const res = await isHandleFree(candidate);
    if (res.ok) return candidate;
  }
  return `${base}${Date.now().toString().slice(-4)}`;
}

/**
 * Registration helper: derive the part before the `@` from the e-mail address
 * and return a set of free suggestions, most natural first.
 */
export async function suggestHandlesFromEmail(email: string, count = 3) {
  const base = handleBase(email);
  const out: string[] = [];
  const shortBase = base.includes(".") ? base.split(".")[0]! : base;

  for (const candidateBase of [base, shortBase]) {
    for (let i = 0; i < 12 && out.length < count; i += 1) {
      const candidate = `${candidateBase}${twoDigits()}`;
      if (out.includes(candidate)) continue;

      const res = await isHandleFree(candidate);
      if (res.ok) out.push(candidate);
    }
    if (out.length >= count) break;
  }

  if (out.length === 0) out.push(`${base}${Date.now().toString().slice(-4)}`);
  return out;
}
