/**
 * Turns raw server-function failures into actionable admin UI copy.
 *
 * Admin server functions depend on backend secrets (DATABASE_URL,
 * BREVO_API_KEY). When one is missing the
 * portal must not show a generic "something went wrong" — it must name the
 * variable and the action needed to fix it.
 */

export const REQUIRED_SERVER_SECRETS = ["DATABASE_URL", "BREVO_API_KEY"] as const;

export type AdminErrorInfo = {
  /** Toast title. */
  title: string;
  /** Toast description — always says what to do next. */
  description: string;
  /** Env var names detected as missing, if any. */
  missing: string[];
  kind: "config" | "forbidden" | "unauthorized" | "rate_limited" | "unknown";
};

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message ?? "");
  }
  return "";
}

/** Extracts env var names from any of the shapes the backend can throw. */
export function detectMissingSecrets(error: unknown): string[] {
  const message = messageOf(error);
  return REQUIRED_SERVER_SECRETS.filter(
    (name) =>
      message.includes(name) &&
      /missing|not configured|unconfigured|MISSING_SECRET|invalid/i.test(message),
  );
}

export function describeAdminError(error: unknown, fallback: string): AdminErrorInfo {
  const message = messageOf(error);
  const missing = detectMissingSecrets(error);

  if (missing.length > 0) {
    return {
      title: `Backend not configured: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} missing`,
      description:
        "Add the missing value under Cloud → Settings → Secrets, then reload this page. Check the Deployment tab for the full configuration status.",
      missing,
      kind: "config",
    };
  }

  if (/invalid api key|JWT|Expected 3 parts/i.test(message)) {
    return {
      title: "Backend credential rejected (DATABASE_URL)",
      description:
        "The configured database credential is invalid. Replace it under Settings → Secrets and retry.",
      missing: ["DATABASE_URL"],
      kind: "config",
    };
  }

  if (/RATE_LIMITED/i.test(message)) {
    const seconds = /wait (\d+)s/i.exec(message)?.[1];
    return {
      title: "Too many requests",
      description: seconds
        ? `Slow down — retry in about ${seconds} seconds.`
        : "Slow down and retry in a moment.",
      missing: [],
      kind: "rate_limited",
    };
  }

  if (/forbidden|403/i.test(message)) {
    return {
      title: "Not allowed (403)",
      description: "Your account does not hold the admin role required for this action.",
      missing: [],
      kind: "forbidden",
    };
  }

  if (/unauthor|401/i.test(message)) {
    return {
      title: "Session expired (401)",
      description: "Sign in again to continue working in the admin portal.",
      missing: [],
      kind: "unauthorized",
    };
  }

  return {
    title: fallback,
    description: message
      ? message.slice(0, 200)
      : "Please retry — if it persists, check the Deployment tab.",
    missing: [],
    kind: "unknown",
  };
}
