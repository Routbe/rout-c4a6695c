/**
 * Configuration self-check for the admin portal.
 *
 * Runs entirely server-side and never throws: a missing secret is a *result*,
 * not a crash, so the deployment checklist keeps rendering even when the
 * backend is half-configured. Everything here is about our own Neon Postgres
 * in Frankfurt — there is no third-party backend left to point at.
 */

export type ChecklistItem = {
  name: string;
  label: string;
  present: boolean;
  required: boolean;
  hint: string;
  /** Only ever a masked fingerprint — never the value itself. */
  preview: string | null;
};

export type DeploymentStatus = {
  items: ChecklistItem[];
  /** True when the database answered a real query. */
  serviceRoleWorks: boolean;
  serviceRoleError: string | null;
  ok: boolean;
  checkedAt: string;
};

function mask(value: string | undefined): string | null {
  if (!value) return null;
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}…${value.slice(-4)} (${value.length} chars)`;
}

/** Host of the connection string, so an operator can confirm the region. */
function databaseHost(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

export async function getDeploymentStatus(): Promise<DeploymentStatus> {
  const databaseUrl = process.env["DATABASE_URL"];
  const host = databaseHost(databaseUrl);

  const items: ChecklistItem[] = [
    {
      name: "DATABASE_URL",
      label: "Neon connection string",
      present: Boolean(databaseUrl),
      required: true,
      hint: "Pooled Neon Postgres connection. Without it no server function can read or write.",
      preview: mask(databaseUrl),
    },
    {
      name: "DATABASE_HOST",
      label: "Database host",
      present: Boolean(host),
      required: true,
      hint: "Should be the Neon endpoint for the Frankfurt (eu-central-1) region.",
      preview: host,
    },
    {
      name: "BREVO_API_KEY",
      label: "Brevo API key",
      present: Boolean(process.env["BREVO_API_KEY"]),
      required: false,
      hint: "Optional — transactional e-mail (magic links, resets) stays queued until this is set.",
      preview: mask(process.env["BREVO_API_KEY"]),
    },
    {
      name: "MASTODON_STATE_SECRET",
      label: "Mastodon state secret",
      present: Boolean(process.env["MASTODON_STATE_SECRET"]),
      required: false,
      hint: "Optional — signs the Fediverse OAuth state. Falls back to the database URL.",
      preview: mask(process.env["MASTODON_STATE_SECRET"]),
    },
    {
      name: "IMPROVMX_API_KEY",
      label: "ImprovMX API key",
      present: Boolean(process.env["IMPROVMX_API_KEY"]),
      required: false,
      hint: "Optional — alias provisioning stays queued until this is set.",
      preview: mask(process.env["IMPROVMX_API_KEY"]),
    },
  ];

  let serviceRoleWorks = false;
  let serviceRoleError: string | null = null;

  if (!databaseUrl) {
    serviceRoleError = "DATABASE_URL is not configured.";
  } else {
    try {
      const { withServerTimeout } = await import("./server-auth.server");
      const { sql } = await import("./neon");
      await withServerTimeout(
        sql.query(`select count(*)::int as count from public.admin_audit_log`, []),
        "deployment-status.databaseProbe",
      );
      serviceRoleWorks = true;
      // Least privilege: the runtime must not connect as the owner role.
      const who = (await sql.query(`select current_user as role`, [])) as { role: string }[];
      const role = who[0]?.role ?? "";
      items.push({
        name: "DATABASE_ROLE",
        label: "Runtime database role",
        present: role === "rout_app",
        required: false,
        hint:
          role === "rout_app"
            ? "Runtime uses the least-privilege role rout_app (DML only)."
            : `Runtime connects as "${role}". Point DATABASE_URL at rout_app; keep the owner only in MIGRATION_URL.`,
        preview: role || null,
      });
    } catch (error) {
      serviceRoleError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    items,
    serviceRoleWorks,
    serviceRoleError,
    ok: items.every((i) => !i.required || i.present) && serviceRoleWorks,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Throws a clearly-worded, parseable error when the database connection string
 * is absent, instead of letting a query blow up somewhere deeper.
 */
export function assertServiceRole() {
  if (!process.env["DATABASE_URL"]) {
    throw new Error(
      "MISSING_SECRET: DATABASE_URL not configured. Add it under Settings → Secrets.",
    );
  }
}
