/**
 * Access policy for browser-originated queries.
 *
 * Neon has no PostgREST and no row-level security wired to a JWT, so the rules
 * that used to live in RLS policies live here instead: one table allowlist, one
 * ownership column per table, and a hard-coded set of callable functions.
 * Anything not listed is refused.
 */
import { sql } from "@/lib/neon";
import type { QueryDescriptor } from "./types";

type Access = {
  /** Operations the browser may perform. */
  ops: Array<"select" | "insert" | "update" | "upsert" | "delete">;
  /** Column that must equal the signed-in user id; null means unscoped. */
  owner: string | null;
  /** True when anonymous visitors may read the table. */
  publicRead?: boolean;
  /** Columns an anonymous or non-owner reader may never receive. */
  denyColumns?: string[];
  /**
   * Table carries `workspace_id`: personal scope requires `workspace_id IS NULL`,
   * workspace scope requires the exact active workspace (membership checked
   * server-side from the HttpOnly cookie). Rows never cross scopes.
   */
  workspaceScoped?: boolean;
};

const TABLES: Record<string, Access> = {
  profiles: { ops: ["select", "update"], owner: "id" },
  public_profiles: { ops: ["select"], owner: null, publicRead: true },
  showcase_profiles: { ops: ["select"], owner: null, publicRead: true },
  reserved_handles: { ops: ["select"], owner: null, publicRead: true },
  badges: { ops: ["select"], owner: null, publicRead: true },
  links: { ops: ["select", "delete"], owner: "profile_id" },
  saved_qrs: { ops: ["select", "insert", "update", "delete"], owner: "user_id" },
  tracked_qrs: { ops: ["select", "insert", "update", "delete"], owner: "user_id", workspaceScoped: true },
  user_badges: { ops: ["select", "delete"], owner: "user_id" },
  badge_events: { ops: ["select"], owner: "user_id" },
  notifications: { ops: ["select", "update", "delete"], owner: "user_id" },
  custom_domains: { ops: ["select", "delete"], owner: "user_id" },
  email_aliases: { ops: ["select"], owner: "user_id" },
  api_keys: { ops: ["select", "delete"], owner: "user_id", workspaceScoped: true },
  verification_payments: { ops: ["select"], owner: "user_id" },
  user_roles: { ops: ["select"], owner: "user_id" },
  qr_scans: { ops: ["select", "delete"], owner: "__via_tracked_qr__" },
};

/**
 * Columns a non-admin member may never write from the browser (paid status,
 * verification, moderation, billing, admin flags…). Stripped from every
 * insert/update/upsert before SQL is built.
 */
const PROTECTED_COLUMNS: Record<string, string[]> = {
  profiles: [
    "id", "email", "created_at", "tier", "status", "verified", "verified_at", "verified_legal_name",
    "is_suspended", "is_banned", "is_early_believer", "is_paid", "subdomain_enabled", "custom_domain",
    "bluesky_did", "forwarding_email", "forwarding_email_token", "forwarding_email_token_expires_at",
    "forwarding_email_verified", "handle_grant", "payment_method", "moderated_at", "moderated_by",
    "moderation_reason", "alias_status", "alias_sync_status", "alias_sync_attempts", "alias_sync_error",
    "alias_synced_at", "referred_by", "referral_count", "is_admin", "subdomain_alias", "subdomain_tier",
    "root_subdomain_status", "legal_first_name", "legal_last_name", "invited_count", "verified_invites",
    "stripe_account_id", "stripe_account_status", "stripe_charges_enabled", "stripe_payouts_enabled",
    "total_reach_count", "reach_last_synced_at", "is_business", "business_name", "business_vat", "is_influencer",
  ],
  custom_domains: ["status", "verification_token", "verified_at", "last_checked_at"],
  tracked_qrs: ["dashboard_token"],
  notifications: ["user_id", "kind", "title", "body", "locale", "severity", "details", "created_at"],
};

/**
 * Allowlist of browser-writable columns for ordinary members. Tables
 * absent here accept no browser-written columns at all;
 * ownership/workspace columns are re-applied server-side afterwards.
 */
const WRITABLE_COLUMNS: Record<string, string[]> = {
  // Keep this limited to the existing Profile/Account Settings and email
  // visibility controls. Identity, age, billing and lifecycle fields must use
  // their dedicated server workflows; new schema columns are denied by default.
  profiles: ["username", "display_name", "tagline", "bio", "avatar_url", "show_email_publicly"],
  saved_qrs: ["name", "qr_type", "qr_value", "config"],
  tracked_qrs: ["slug", "target_type", "target_url", "label", "custom_domain", "kind", "short_link_enabled"],
  notifications: ["read_at"],
};

function stripProtected(descriptor: QueryDescriptor): QueryDescriptor {
  if (descriptor.values == null) return descriptor;
  const blocked = PROTECTED_COLUMNS[descriptor.table] ?? [];
  const allowed = WRITABLE_COLUMNS[descriptor.table] ?? [];
  const clean = (row: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(row ?? {}).filter(([k]) => !blocked.includes(k) && allowed.includes(k)),
    );
  const values = Array.isArray(descriptor.values)
    ? descriptor.values.map((r) => clean(r as Record<string, unknown>))
    : clean(descriptor.values as Record<string, unknown>);
  return { ...descriptor, values: values as QueryDescriptor["values"] };
}

/** Functions the browser may call, and whether they need a session. */
const FUNCTIONS: Record<string, { auth: boolean }> = {
  delete_account: { auth: true },
  claim_referral: { auth: true },
  log_qr_scan: { auth: false },
  manage_short_link: { auth: true },
  resolve_short_link: { auth: false },
  short_link_stats: { auth: false },
  signin_guard_record: { auth: false },
  signin_guard_status: { auth: false },
  is_handle_available: { auth: false },
  get_public_profile: { auth: false },
  get_my_profile: { auth: true },
  get_my_account: { auth: true },
};

export type PolicyDecision =
  { ok: true; descriptor: QueryDescriptor } | { ok: false; message: string };

export async function isAdmin(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const rows = (await sql.query(
    `select 1 from public.user_roles where user_id = $1 and role = 'admin' limit 1`,
    [userId],
  )) as unknown[];
  return rows.length > 0;
}

export async function authorizeQuery(
  descriptor: QueryDescriptor,
  userId: string | null,
): Promise<PolicyDecision> {
  const access = TABLES[descriptor.table];
  if (!access)
    return { ok: false, message: `Table ${descriptor.table} is not accessible from the browser` };
  if (!access.ops.includes(descriptor.action)) {
    return { ok: false, message: `${descriptor.action} on ${descriptor.table} is not allowed` };
  }

  // Admins may read/delete across owners, but browser writes still pass the
  // column allowlist; privileged field changes go through typed admin functions.
  if (await isAdmin(userId)) {
    if (descriptor.action === "select" || descriptor.action === "delete") return { ok: true, descriptor };
    return { ok: true, descriptor: stripProtected(descriptor) };
  }

  if (descriptor.action === "select" && access.owner === null) {
    if (!access.publicRead && !userId) return { ok: false, message: "Sign in required" };
    return { ok: true, descriptor };
  }

  if (!userId) {
    return { ok: false, message: "Sign in required" };
  }

  if (access.owner === "__via_tracked_qr__") {
    const filter = descriptor.filters.find((f) => f.column === "tracked_qr_id");
    if (!filter) return { ok: false, message: "qr_scans requires a tracked_qr_id filter" };
    const ids = (Array.isArray(filter.value) ? filter.value : [filter.value]).map(String);
    const { resolveActiveWorkspace } = await import("@/lib/workspaces.server");
    const { workspaceId } = await resolveActiveWorkspace(userId);
    const rows = (workspaceId
      ? await sql.query(`select id from public.tracked_qrs where workspace_id = $1 and id = any($2)`, [workspaceId, ids])
      : await sql.query(
          `select id from public.tracked_qrs where user_id = $1 and workspace_id is null and id = any($2)`,
          [userId, ids],
        )) as { id: string }[];
    if (rows.length !== ids.length) return { ok: false, message: "Not your tracked QR" };
    return { ok: true, descriptor };
  }

  const owner = access.owner;
  if (!owner) return { ok: false, message: "Owner scope required" };
  if (access.workspaceScoped) return scopeToWorkspace(descriptor, owner, userId);

  const writable = descriptor.action === "select" || descriptor.action === "delete" ? descriptor : stripProtected(descriptor);
  const scoped: QueryDescriptor = {
    ...writable,
    filters: [
      ...descriptor.filters.filter((f) => !(f.column === owner)),
      { op: "eq", column: owner, value: userId },
    ],
  };
  if (scoped.action === "insert" || scoped.action === "upsert") {
    const rows = Array.isArray(scoped.values) ? scoped.values : [scoped.values ?? {}];
    scoped.values = rows.map((row) => ({ ...(row as Record<string, unknown>), [owner]: userId })) as QueryDescriptor["values"];
    scoped.filters = descriptor.filters;
  }
  return { ok: true, descriptor: scoped };
}

async function scopeToWorkspace(
  descriptor: QueryDescriptor,
  owner: string,
  userId: string,
): Promise<PolicyDecision> {
  const { resolveActiveWorkspace } = await import("@/lib/workspaces.server");
  const { workspaceId } = await resolveActiveWorkspace(userId);
  const writable = descriptor.action === "select" || descriptor.action === "delete" ? descriptor : stripProtected(descriptor);
  // Client may never pick its own owner or workspace.
  const clientFilters = descriptor.filters.filter((f) => f.column !== owner && f.column !== "workspace_id");
  const scopeFilters: QueryDescriptor["filters"] = workspaceId
    ? [{ op: "eq", column: "workspace_id", value: workspaceId }]
    : [
        { op: "eq", column: owner, value: userId },
        { op: "is", column: "workspace_id", value: null },
      ];
  if (writable.action === "insert" || writable.action === "upsert") {
    const rows = Array.isArray(writable.values) ? writable.values : [writable.values ?? {}];
    return {
      ok: true,
      descriptor: {
        ...writable,
        filters: clientFilters,
        values: rows.map((row) => ({ ...(row as Record<string, unknown>), [owner]: userId, workspace_id: workspaceId })) as QueryDescriptor["values"],
      },
    };
  }
  let values = writable.values;
  if (writable.action === "update" && values && !Array.isArray(values)) {
    const { [owner]: _o, workspace_id: _w, ...rest } = values as Record<string, unknown>;
    values = rest as QueryDescriptor["values"];
  }
  return { ok: true, descriptor: { ...writable, values, filters: [...clientFilters, ...scopeFilters] } };
}

export function authorizeRpc(
  fn: string,
  userId: string | null,
): { ok: true } | { ok: false; message: string } {
  const rule = FUNCTIONS[fn];
  if (!rule) return { ok: false, message: `Function ${fn} is not callable from the browser` };
  if (rule.auth && !userId) return { ok: false, message: "Sign in required" };
  return { ok: true };
}
