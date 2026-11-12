/**
 * Uniform handling for endpoints that depend on backend secrets
 * (DATABASE_URL, BREVO_API_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, CRON_SECRET).
 *
 * A missing secret must never crash a route or freeze the UI — every caller
 * receives the same structured payload so the client can degrade to a
 * "sandbox mode" notice instead of an unhandled error.
 */
export const MISSING_SECRET_CODE = "MISSING_SECRET" as const;

export const MISSING_SECRET_BODY = {
  error: "Service temporarily unconfigured",
  code: MISSING_SECRET_CODE,
} as const;

export function missingSecretResponse(status = 503): Response {
  return new Response(JSON.stringify(MISSING_SECRET_BODY), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Names of the requested env vars that are absent or empty. */
export function missingSecrets(names: readonly string[]): string[] {
  return names.filter((name) => !process.env[name]);
}

/** True when a thrown error is really "a backend secret is not configured". */
export function isMissingSecretError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("Missing Postgres environment variable") ||
    message.includes("not_configured") ||
    message.includes(MISSING_SECRET_CODE)
  );
}

/** Copy shown to users when a feature runs without its backend secret. */
export const SANDBOX_MODE_MESSAGE =
  "This feature is operating in Sandbox mode — not configured yet.";
