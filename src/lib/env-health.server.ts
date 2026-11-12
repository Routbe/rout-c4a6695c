/**
 * Live probes for the "Environment & API Health" widget.
 *
 * Every probe is read-only, short and swallows its own errors: the widget must
 * never take the admin portal down. No secret value is ever returned — only
 * whether the credential works.
 */
import type { EnvHealth, ServiceHealth } from "./env-health.functions";

async function probeNeon(): Promise<ServiceHealth> {
  const { hasDatabase } = await import("./neon");
  if (!hasDatabase()) {
    return { key: "neon", label: "Neon Postgres", ok: false, detail: "Databaseconfiguratie ontbreekt" };
  }
  try {
    const { sql } = await import("./neon");
    await sql`select 1 as ok`;
    return { key: "neon", label: "Neon Postgres", ok: true, detail: "Verbonden" };
  } catch {
    return {
      key: "neon",
      label: "Neon Postgres",
      ok: false,
      detail: "Verbinding of beperkte databaserol kon niet worden bevestigd",
    };
  }
}

async function probeBrevo(): Promise<ServiceHealth> {
  const key = process.env["BREVO_API_KEY"];
  if (!key) {
    return { key: "brevo", label: "Brevo e-mail", ok: false, detail: "BREVO_API_KEY ontbreekt" };
  }
  try {
    const res = await fetch("https://api.brevo.com/v3/account", {
      headers: { "api-key": key, Accept: "application/json" },
    });
    return {
      key: "brevo",
      label: "Brevo e-mail",
      ok: res.ok,
      detail: res.ok ? "API-sleutel geldig" : `HTTP ${res.status}`,
    };
  } catch (error) {
    return {
      key: "brevo",
      label: "Brevo e-mail",
      ok: false,
      detail: error instanceof Error ? error.message.slice(0, 160) : "Netwerkfout",
    };
  }
}

async function probeStripe(): Promise<ServiceHealth> {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) {
    return { key: "stripe", label: "Stripe API", ok: false, detail: "STRIPE_SECRET_KEY ontbreekt" };
  }
  try {
    const res = await fetch("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${key}` },
    });
    return {
      key: "stripe",
      label: "Stripe API",
      ok: res.ok,
      detail: res.ok ? "Sleutel geldig" : `HTTP ${res.status}`,
    };
  } catch (error) {
    return {
      key: "stripe",
      label: "Stripe API",
      ok: false,
      detail: error instanceof Error ? error.message.slice(0, 160) : "Netwerkfout",
    };
  }
}

function probeWebhook(): ServiceHealth {
  const secret = process.env["STRIPE_WEBHOOK_SECRET"];
  return {
    key: "stripe_webhook",
    label: "Stripe webhook",
    ok: Boolean(secret),
    detail: secret
      ? "Signing secret geconfigureerd (/api/public/stripe-webhook)"
      : "STRIPE_WEBHOOK_SECRET ontbreekt — webhooks antwoorden 503",
  };
}

export async function probeServices(): Promise<EnvHealth> {
  const { checkEnv } = await import("./env");
  const report = checkEnv();
  const [neon, brevo, stripe] = await Promise.all([probeNeon(), probeBrevo(), probeStripe()]);
  return {
    services: [neon, brevo, stripe, probeWebhook()],
    missingRequired: report.missingRequired,
    missingOptional: report.missingOptional,
  };
}
