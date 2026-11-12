/**
 * Server-only admin helpers. Every export here assumes the caller was already
 * proven to hold the `admin` role — the check lives in `admin.functions.ts`.
 */
import { sql } from "@/lib/neon";

type Row = Record<string, unknown>;

/** True when `userId` holds `role` in `public.user_roles`. Role is compared as text
 *  so callers can probe roles that may not exist in the `app_role` enum yet. */
async function hasRole(userId: string, role: string): Promise<boolean> {
  const rows = (await sql`
    select 1 from public.user_roles where user_id = ${userId} and role::text = ${role} limit 1
  `) as Row[];
  return rows.length > 0;
}

/** Throws unless the caller holds the admin role. */
export async function assertAdminRole(userId: string) {
  // Public deployment (rout.be) never executes admin server functions.
  const { isPublicMode } = await import("./app-mode");
  if (isPublicMode()) throw new Error("Forbidden");
  if (!(await hasRole(userId, "admin"))) throw new Error("Forbidden");
  await assertAdminTwoFactor(userId);
}

/** Admin surfaces answer only once the admin has 2FA switched on. */
async function assertAdminTwoFactor(userId: string) {
  const { memberTwoFactorEnabled } = await import("./auth/second-factor.server");
  const { adminAccessDecision, ADMIN_TWO_FACTOR_REQUIRED } = await import("./auth/sign-in-policy");
  if (adminAccessDecision(true, await memberTwoFactorEnabled(userId)) !== "allow") {
    throw Object.assign(new Error(ADMIN_TWO_FACTOR_REQUIRED), { statusCode: 403 });
  }
}

/** Roles allowed into the VIP short-handle console. */
export const VIP_CONSOLE_ROLES = ["admin", "security"] as const;
export type VipConsoleRole = (typeof VIP_CONSOLE_ROLES)[number];

/**
 * Resolves the caller's VIP console role. Returns `null` when neither the
 * `admin` nor the `security` role is held.
 */
export async function resolveVipConsoleRole(userId: string): Promise<VipConsoleRole | null> {
  for (const role of VIP_CONSOLE_ROLES) {
    if (await hasRole(userId, role)) return role;
  }
  return null;
}

/** Hard gate for every VIP panel server function. */
export async function assertVipConsoleRole(userId: string): Promise<VipConsoleRole> {
  const { isPublicMode } = await import("./app-mode");
  if (isPublicMode()) throw new Error("Forbidden");
  const role = await resolveVipConsoleRole(userId);
  if (!role) throw new Error("Forbidden");
  if (role === "admin") await assertAdminTwoFactor(userId);
  return role;
}

export type PendingVerification = {
  paymentId: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  username: string | null;
  tier: string;
  method: "sepa" | "card";
  reference: string;
  amountCents: number;
  donationCents: number;
  status: string;
  createdAt: string;
  /** How many open requests (same user + category) this entry stands for. */
  duplicates?: number;
};

export type AdminUserRow = {
  userId: string;
  email: string | null;
  displayName: string | null;
  username: string | null;
  verified: boolean;
  tier: string;
};

function shortRef(id: string) {
  return `ROUT-${id.replace(/\D/g, "").slice(0, 4).padEnd(4, "0")}`;
}

function toPendingVerification(r: Row): PendingVerification {
  return {
    paymentId: r["id"] as string,
    userId: r["user_id"] as string,
    email: (r["email"] as string | null) ?? null,
    displayName: (r["display_name"] as string | null) ?? null,
    username: (r["username"] as string | null) ?? null,
    tier: r["tier"] as string,
    method: r["provider"] === "sepa" ? "sepa" : "card",
    reference: (r["reference_code"] as string | null) ?? shortRef(r["id"] as string),
    amountCents: r["amount_cents"] as number,
    donationCents: (r["donation_cents"] as number | null) ?? 0,
    status: r["status"] as string,
    createdAt: r["created_at"] as string,
  };
}

/** Payments still awaiting a manual match, newest first. */
export async function fetchPendingVerifications(limit = 100): Promise<PendingVerification[]> {
  const rows = (await sql`
    select vp.id, vp.user_id, vp.tier, vp.amount_cents, vp.donation_cents, vp.provider,
           vp.reference_code, vp.status, vp.created_at,
           p.display_name, p.username, u.email
      from public.verification_payments vp
      left join public.profiles p on p.id = vp.user_id
      left join public.users u on u.id = vp.user_id
     order by vp.created_at desc
     limit ${limit}
  `) as Row[];
  const { groupOpenRequests } = await import("./verification-dedupe");
  return groupOpenRequests(rows.map(toPendingVerification));
}

/** Flips a payment to paid, grants the badge and records a notification event. */
export async function approvePayment(paymentId: string, adminId: string) {
  const rows = (await sql`
    select id, user_id, tier, status, reference_code from public.verification_payments where id = ${paymentId} limit 1
  `) as Row[];
  const payment = rows[0];
  if (!payment) return { ok: false as const, reason: "not_found" as const };

  await sql`
    update public.verification_payments
       set status = 'paid', provider_ref = ${`manual:${adminId}`}, updated_at = now()
     where id = ${payment["id"]}
  `;

  // Close duplicate open requests from the same user for the same category.
  try {
    await sql`
      update public.verification_payments
         set status = 'cancelled', provider_ref = ${`duplicate_of:${payment["id"]}`}, updated_at = now()
       where user_id = ${payment["user_id"]} and tier = ${payment["tier"]}
         and id <> ${payment["id"]} and status in ('pending', 'incomplete')
    `;
  } catch (err) {
    console.warn("[admin] could not close duplicate verification requests", err);
  }

  await sql`
    update public.profiles
       set tier = ${payment["tier"]}, verified = true, status = 'active', verified_at = now()
     where id = ${payment["user_id"]}
  `;

  await sql`
    insert into public.security_events (user_id, kind, severity, message, details)
    values (${payment["user_id"]}, 'verification_approved_manually', 'info', 'Your ROUT verification is live!',
      ${JSON.stringify({
        payment_id: payment["id"],
        reference: payment["reference_code"],
        approved_by: adminId,
        notify: "email",
      })})
  `;

  await writeAudit({
    adminId,
    action: "payment_approved",
    targetUserId: payment["user_id"] as string,
    targetLabel: payment["reference_code"] as string | null,
    notes: `Tier ${payment["tier"]} granted`,
  });

  return { ok: true as const, userId: payment["user_id"] as string };
}

/** Payments stuck in the "incomplete" state (Stripe requires_action / payment_failed). */
export async function fetchIncompletePayments(limit = 100): Promise<PendingVerification[]> {
  const rows = (await sql`
    select vp.id, vp.user_id, vp.tier, vp.amount_cents, vp.donation_cents, vp.provider,
           vp.reference_code, vp.status, vp.created_at,
           p.display_name, p.username, u.email
      from public.verification_payments vp
      left join public.profiles p on p.id = vp.user_id
      left join public.users u on u.id = vp.user_id
     where vp.status = 'incomplete'
     order by vp.created_at desc
     limit ${limit}
  `) as Row[];
  return rows.map(toPendingVerification);
}

/** Resolve an incomplete payment: approve as paid, mark failed, or reset to pending for retry. */
export async function resolveIncompletePayment(
  paymentId: string,
  action: "approve" | "fail" | "retry",
  adminId: string,
  reason?: string,
) {
  const rows = (await sql`
    select id, user_id, tier, status, reference_code from public.verification_payments where id = ${paymentId} limit 1
  `) as Row[];
  const payment = rows[0];
  if (!payment) return { ok: false as const, reason: "not_found" as const };
  if (payment["status"] !== "incomplete" && payment["status"] !== "pending") {
    return { ok: false as const, reason: "not_incomplete" as const };
  }

  if (action === "approve") {
    return approvePayment(paymentId, adminId);
  }

  const nextStatus = action === "fail" ? "failed" : "pending";
  await sql`
    update public.verification_payments
       set status = ${nextStatus}, provider_ref = ${`manual:${adminId}`}, updated_at = now()
     where id = ${payment["id"]}
  `;

  await sql`
    insert into public.security_events (user_id, kind, severity, message, details)
    values (${payment["user_id"]}, ${action === "fail" ? "payment_failed_manually" : "payment_retry_manually"},
      ${action === "fail" ? "warning" : "info"},
      ${
        action === "fail"
          ? `Verification payment marked failed manually${reason ? `: ${reason}` : ""}.`
          : "Verification payment reset to pending for customer retry."
      },
      ${JSON.stringify({
        payment_id: payment["id"],
        reference: payment["reference_code"],
        admin_id: adminId,
        ...(reason ? { reason } : {}),
      })})
  `;

  await writeAudit({
    adminId,
    action: action === "fail" ? "payment_failed_manually" : "payment_retry_manually",
    targetUserId: payment["user_id"] as string,
    targetLabel: payment["reference_code"] as string | null,
    notes: reason || `Status set to ${nextStatus}`,
  });

  return { ok: true as const, userId: payment["user_id"] as string };
}

/** Looks a user up by e-mail (partial), handle or exact user id. */
export async function searchUsers(query: string): Promise<AdminUserRow[]> {
  const term = query.trim().replace(/^@/, "");
  if (!term) return [];

  const isUuid = /^[0-9a-f-]{36}$/i.test(term);

  const rows = (
    isUuid
      ? await sql`
        select p.id, p.display_name, p.username, p.verified, p.tier, u.email
          from public.profiles p left join public.users u on u.id = p.id
         where p.id = ${term}
         limit 20
      `
      : term.includes("@")
        ? await sql`
          select p.id, p.display_name, p.username, p.verified, p.tier, u.email
            from public.users u left join public.profiles p on p.id = u.id
           where u.email_normalized ilike ${`%${term.toLowerCase()}%`}
           limit 20
        `
        : await sql`
          select p.id, p.display_name, p.username, p.verified, p.tier, u.email
            from public.profiles p left join public.users u on u.id = p.id
           where p.username ilike ${`%${term}%`}
           limit 20
        `
  ) as Row[];

  return rows.map((r) => ({
    userId: r["id"] as string,
    email: (r["email"] as string | null) ?? null,
    displayName: (r["display_name"] as string | null) ?? null,
    username: (r["username"] as string | null) ?? null,
    verified: Boolean(r["verified"]),
    tier: (r["tier"] as string | null) ?? "free",
  }));
}

/** Manual handle assignment + VIP badge toggle. Admin bypasses handle length limits. */
export async function overrideUser(opts: {
  userId: string;
  handle?: string | null;
  verified?: boolean;
  adminId: string;
}) {
  const patch: Record<string, unknown> = {};

  if (typeof opts.handle === "string") {
    const handle = opts.handle.trim().replace(/^@/, "");
    patch["username"] = handle.length > 0 ? handle : null;
  }
  if (typeof opts.verified === "boolean") {
    patch["verified"] = opts.verified;
    patch["verified_at"] = opts.verified ? new Date().toISOString() : null;
    if (opts.verified) patch["status"] = "active";
  }
  if (Object.keys(patch).length === 0) return { ok: true as const };

  try {
    if ("username" in patch) {
      await sql`update public.profiles set username = ${patch["username"] as string | null}, updated_at = now() where id = ${opts.userId}`;
    }
    if ("verified" in patch) {
      await sql`
        update public.profiles
           set verified = ${patch["verified"] as boolean},
               verified_at = ${(patch["verified_at"] as string | null) ?? null},
               status = coalesce(${(patch["status"] as string | undefined) ?? null}, status),
               updated_at = now()
         where id = ${opts.userId}
      `;
    }
  } catch (error) {
    return { ok: false as const, reason: error instanceof Error ? error.message : "update_failed" };
  }

  await sql`
    insert into public.security_events (user_id, kind, severity, message, details)
    values (${opts.userId}, 'admin_override', 'warning', 'Profile updated by an administrator.',
      ${JSON.stringify({ ...patch, admin_id: opts.adminId })})
  `;

  await writeAudit({
    adminId: opts.adminId,
    action: "profile_override",
    targetUserId: opts.userId,
    targetLabel: (patch["username"] as string | null) ?? null,
    notes: JSON.stringify(patch),
  });

  return { ok: true as const };
}

/** Append-only trail of every admin action. Never throws — auditing must not block the action. */
export async function writeAudit(entry: {
  adminId: string;
  action: string;
  targetUserId?: string | null;
  targetLabel?: string | null;
  notes?: string | null;
}) {
  try {
    const rows =
      (await sql`select email from public.users where id = ${entry.adminId} limit 1`) as Row[];
    const adminEmail = (rows[0]?.["email"] as string | null) ?? null;
    await sql`
      insert into public.admin_audit_log (admin_id, admin_email, action, target_user_id, target_label, notes)
      values (${entry.adminId}, ${adminEmail}, ${entry.action}, ${entry.targetUserId ?? null},
              ${entry.targetLabel ?? null}, ${entry.notes ?? null})
    `;
  } catch (error) {
    console.error("audit log write failed", error);
  }
}

export type AuditEntry = {
  id: string;
  adminEmail: string | null;
  action: string;
  targetUserId: string | null;
  targetLabel: string | null;
  notes: string | null;
  createdAt: string;
};

export type AuditFilters = {
  adminEmail?: string;
  action?: string;
  from?: string;
  to?: string;
};

function toAuditEntry(r: Row): AuditEntry {
  return {
    id: r["id"] as string,
    adminEmail: (r["admin_email"] as string | null) ?? null,
    action: r["action"] as string,
    targetUserId: (r["target_user_id"] as string | null) ?? null,
    targetLabel: (r["target_label"] as string | null) ?? null,
    notes: (r["notes"] as string | null) ?? null,
    createdAt: r["created_at"] as string,
  };
}

/** Newest admin actions first, optionally narrowed by admin, action or date range. */
export async function fetchAuditLog(
  filters: AuditFilters = {},
  limit = 500,
): Promise<AuditEntry[]> {
  const to = filters.to ? new Date(filters.to) : null;
  if (to) to.setHours(23, 59, 59, 999);

  const rows = (await sql`
    select id, admin_email, action, target_user_id, target_label, notes, created_at
      from public.admin_audit_log
     where (${filters.adminEmail ?? null}::text is null or admin_email ilike ${filters.adminEmail ? `%${filters.adminEmail}%` : null})
       and (${filters.action ?? null}::text is null or action = ${filters.action ?? null})
       and (${filters.from ?? null}::text is null or created_at >= ${filters.from ? new Date(filters.from).toISOString() : null}::timestamptz)
       and (${to ? to.toISOString() : null}::text is null or created_at <= ${to ? to.toISOString() : null}::timestamptz)
     order by created_at desc
     limit ${limit}
  `) as Row[];

  return rows.map(toAuditEntry);
}

/** Moves a payment through the SEPA lifecycle without granting anything. */
export async function setPaymentStatus(
  paymentId: string,
  status: "pending" | "failed",
  adminId: string,
  reason?: string,
) {
  const rows = (await sql`
    select id, user_id, reference_code, status from public.verification_payments where id = ${paymentId} limit 1
  `) as Row[];
  const payment = rows[0];
  if (!payment) return { ok: false as const, reason: "not_found" as const };

  await sql`
    update public.verification_payments set status = ${status}, updated_at = now() where id = ${payment["id"]}
  `;

  // Only a `paid` payment grants the badge — moving away from paid revokes it.
  if (payment["status"] === "paid") {
    await sql`
      update public.profiles set verified = false, verified_at = null where id = ${payment["user_id"]}
    `;
  }

  if (status === "failed") {
    await sql`
      insert into public.security_events (user_id, kind, severity, message, details)
      values (${payment["user_id"]}, 'verification_rejected', 'warning',
        'We could not match your verification payment.',
        ${JSON.stringify({
          payment_id: payment["id"],
          reference: payment["reference_code"],
          reason: reason ?? null,
          notify: "email",
        })})
    `;
  }

  await writeAudit({
    adminId,
    action: status === "failed" ? "payment_rejected" : "payment_reopened",
    targetUserId: payment["user_id"] as string,
    targetLabel: payment["reference_code"] as string | null,
    notes: reason ?? null,
  });

  return { ok: true as const, userId: payment["user_id"] as string };
}

const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
const RESERVED_HANDLES = new Set([
  "admin",
  "api",
  "auth",
  "dashboard",
  "free",
  "rout",
  "settings",
  "studio",
  "support",
]);

export type HandleCheck = { ok: boolean; normalized: string; reason?: string };

/** Live format + uniqueness check used by the admin handle override field. */
export async function checkHandle(handle: string, forUserId?: string): Promise<HandleCheck> {
  const normalized = handle.trim().replace(/^@/, "").toLowerCase();
  if (!normalized) return { ok: false, normalized, reason: "Handle cannot be empty." };
  if (normalized.length > 120) return { ok: false, normalized, reason: "Maximum 120 characters." };
  if (!HANDLE_PATTERN.test(normalized)) {
    return {
      ok: false,
      normalized,
      reason: "Use a–z, 0–9, dot, dash or underscore; must start and end alphanumeric.",
    };
  }
  if (RESERVED_HANDLES.has(normalized)) {
    return { ok: false, normalized, reason: "This handle is reserved by the platform." };
  }

  const rows = (await sql`
    select id, username from public.profiles where username ilike ${normalized} limit 5
  `) as Row[];

  const taken = rows.find((row) => row["id"] !== forUserId);
  if (taken) return { ok: false, normalized, reason: "Already taken by another account." };

  return { ok: true, normalized };
}
