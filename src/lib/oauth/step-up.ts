/** Pure rules for "Login met ROUT" step-up verification (shared + testable). */

export const STRICT_ACR = "urn:rout:acr:strict";

export function needsStepUp(input: {
  flowPreference: "seamless" | "strict";
  prompt?: string | null;
  maxAge?: string | number | null;
  acrValues?: string | null;
}): boolean {
  if (input.flowPreference === "strict") return true;
  const prompts = (input.prompt ?? "").split(" ").filter(Boolean);
  if (prompts.includes("login")) return true;
  if (input.maxAge !== undefined && input.maxAge !== null && String(input.maxAge) !== "") return true;
  const acr = (input.acrValues ?? "").split(" ").filter(Boolean);
  return acr.includes(STRICT_ACR);
}

export type StepUpState = "ok" | "wrong" | "expired" | "locked" | "missing";

export const STEP_UP_MAX_ATTEMPTS = 5;

export function stepUpCodeState(
  row: { attempts: number; expiresAt: string; matches: boolean } | null,
  now: number,
): StepUpState {
  if (!row) return "missing";
  if (Date.parse(row.expiresAt) <= now) return "expired";
  if (row.attempts >= STEP_UP_MAX_ATTEMPTS) return "locked";
  return row.matches ? "ok" : "wrong";
}

/** Public activity reaches the app only when the app AND the user opted in. */
export function shareRichIdentity(appEnabled: boolean, userOptIn: boolean): boolean {
  return appEnabled && userOptIn;
}
