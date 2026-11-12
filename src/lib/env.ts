/**
 * Environment validation.
 *
 * Server code reads `process.env` lazily (Cloudflare injects it per request),
 * so this module never touches env at module scope. Call `checkEnv()` from a
 * server function or route handler to get a diagnosable report, and
 * `warnMissingEnv()` to log once per worker when something critical is absent.
 */

export type EnvKey =
  | "DATABASE_URL"
  | "LOVABLE_API_KEY"
  | "NEON_API_KEY"
  | "BETTER_AUTH_SECRET"
  | "BETTER_AUTH_URL"
  | "PUBLIC_SITE_URL"
  | "PUBLIC_ORIGIN"
  | "BREVO_API_KEY"
  | "ADMIN_EMAIL"
  | "STRIPE_SECRET_KEY"
  | "STRIPE_WEBHOOK_SECRET"
  | "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
  | "NEXT_PUBLIC_APP_URL"
  | "LOVABLE_CRON_SECRET";

/** Keys the app cannot run without in production. */
export const REQUIRED_ENV: EnvKey[] = ["DATABASE_URL", "BETTER_AUTH_SECRET", "PUBLIC_ORIGIN"];

/** Keys that only disable a feature when missing. */
export const OPTIONAL_ENV: EnvKey[] = [
  "LOVABLE_API_KEY",
  "NEON_API_KEY",
  "BETTER_AUTH_URL",
  "NEXT_PUBLIC_APP_URL",
  "PUBLIC_SITE_URL",
  "BREVO_API_KEY",
  "ADMIN_EMAIL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "LOVABLE_CRON_SECRET",
];

export type EnvReport = {
  production: boolean;
  present: EnvKey[];
  missingRequired: EnvKey[];
  missingOptional: EnvKey[];
  ok: boolean;
};

function has(key: EnvKey): boolean {
  if (key === "DATABASE_URL" && process.env["NEON_API_KEY"]?.trim() && process.env["LOVABLE_API_KEY"]?.trim()) return true;
  const value = process.env[key];
  return typeof value === "string" && value.trim().length > 0;
}

/** Never returns values — only which keys are configured. */
export function checkEnv(): EnvReport {
  const production = (process.env["NODE_ENV"] ?? "production") === "production";
  const present: EnvKey[] = [];
  const missingRequired: EnvKey[] = [];
  const missingOptional: EnvKey[] = [];

  for (const key of REQUIRED_ENV) (has(key) ? present : missingRequired).push(key);
  for (const key of OPTIONAL_ENV) (has(key) ? present : missingOptional).push(key);

  return {
    production,
    present,
    missingRequired,
    missingOptional,
    ok: missingRequired.length === 0,
  };
}

let warned = false;

/** Logs a single clear diagnostic per worker when required keys are missing. */
export function warnMissingEnv(): EnvReport {
  const report = checkEnv();
  if (!warned && report.missingRequired.length > 0) {
    warned = true;
    console.error(
      `[env] Missing required environment variables: ${report.missingRequired.join(", ")}` +
        (report.production ? " — production features will fail." : ""),
    );
  }
  if (!warned && report.missingOptional.length > 0) {
    console.warn(`[env] Optional keys not configured: ${report.missingOptional.join(", ")}`);
  }
  return report;
}
