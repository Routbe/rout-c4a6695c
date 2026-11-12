import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

/** Portal entry: full `admin` role, or at least one delegated admin permission. */
export const amIAdmin = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { sql } = await import("./neon");
    const rows = (await sql`
      select 1 from public.user_roles where user_id = ${context.userId} and role::text = 'admin' limit 1
    `) as unknown[];
    if (rows.length > 0) return { isAdmin: true, fullAdmin: true };
    // Co-admins with delegated permissions may enter the portal; each action still checks its own permission.
    const perms = (await sql`
      select 1 from public.admin_permissions where user_id = ${context.userId} limit 1
    `.catch(() => [])) as unknown[];
    return { isAdmin: perms.length > 0, fullAdmin: false };
  });

/** Payments awaiting a manual SEPA/card match. */
export const listPendingVerifications = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { assertAdminRole, fetchPendingVerifications } = await import("./admin.server");
    await assertAdminRole(context.userId);
    return fetchPendingVerifications();
  });

/** Approve a payment, grant the badge and queue the "verification is live" notice. */
export const approveVerification = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => z.object({ paymentId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertAdminRole, approvePayment } = await import("./admin.server");
    await assertAdminRole(context.userId);
    return approvePayment(data.paymentId, context.userId);
  });

/** Payments stuck in the Stripe "incomplete" state awaiting admin action. */
export const listIncompletePayments = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { assertAdminRole, fetchIncompletePayments } = await import("./admin.server");
    await assertAdminRole(context.userId);
    return fetchIncompletePayments();
  });

/** Resolve an incomplete payment: approve, fail, or reset to pending for retry. */
export const resolveIncompletePayment = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        paymentId: z.string().uuid(),
        action: z.enum(["approve", "fail", "retry"]),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole, resolveIncompletePayment: resolve } = await import("./admin.server");
    await assertAdminRole(context.userId);
    return resolve(data.paymentId, data.action, context.userId, data.reason);
  });

/** Look up a user by e-mail, handle or user id. */
export const findUsers = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => z.object({ query: z.string().min(1).max(200) }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertVipConsoleRole, searchUsers } = await import("./admin.server");
    await assertVipConsoleRole(context.userId);
    return searchUsers(data.query);
  });

/** Manual handle assignment and VIP badge toggle — bypasses normal handle limits. */
export const overrideUserProfile = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        handle: z.string().max(120).optional(),
        verified: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole, overrideUser } = await import("./admin.server");
    await assertAdminRole(context.userId);
    return overrideUser({ ...data, adminId: context.userId });
  });

/** Reject / reopen a SEPA payment without granting a badge. */
export const setVerificationStatus = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        paymentId: z.string().uuid(),
        status: z.enum(["pending", "failed"]),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole, setPaymentStatus } = await import("./admin.server");
    await assertAdminRole(context.userId);
    return setPaymentStatus(data.paymentId, data.status, context.userId, data.reason);
  });

/** Append-only trail of admin actions, optionally filtered. */
export const listAuditLog = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        adminEmail: z.string().trim().max(200).optional(),
        action: z.string().trim().max(80).optional(),
        from: z.string().trim().max(40).optional(),
        to: z.string().trim().max(40).optional(),
      })
      .partial()
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole, fetchAuditLog } = await import("./admin.server");
    await assertAdminRole(context.userId);
    return fetchAuditLog({
      adminEmail: data.adminEmail || undefined,
      action: data.action || undefined,
      from: data.from || undefined,
      to: data.to || undefined,
    });
  });

/** Live format + uniqueness validation for the handle override field. */
export const validateHandle = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z.object({ handle: z.string().max(200), userId: z.string().uuid().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole, checkHandle } = await import("./admin.server");
    await assertAdminRole(context.userId);
    return checkHandle(data.handle, data.userId);
  });

/* ------------------------------------------------------------------ *
 * Moderation, short handle allocation, pagination and alias controls  *
 * ------------------------------------------------------------------ */

const pageInput = z.object({
  page: z.number().int().min(1).max(10_000).optional(),
  perPage: z.number().int().min(5).max(200).optional(),
});

/** Server-side paginated user list with search and an optional compact segment filter. */
export const listUsers = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    pageInput
      .extend({
        query: z.string().trim().max(200).optional(),
        segment: z
          .enum(["all", "free", "verified_paid", "alias_unsynced", "suspended_or_banned"])
          .optional(),
        memberStatus: z.enum(["active", "frozen", "shadowbanned"]).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { listUsersPage } = await import("./admin-moderation.server");
    return listUsersPage(data);
  });

/** System health KPIs for the portal's top widget row. */
export const getSystemHealth = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { getAdminKpis } = await import("./admin-moderation.server");
    return getAdminKpis();
  });

/** De profielen achter één KPI-tegel, zodat de admin kan doorklikken. */
export const getSystemHealthRows = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        metric: z.enum([
          "activeUsers",
          "pendingVerifications",
          "incompletePayments",
          "pendingSepaPayments",
          "failedAliasSyncs",
        ]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { getAdminKpiRows } = await import("./admin-moderation.server");
    return getAdminKpiRows(data.metric);
  });

/** Bulk-grant the VIP short-handle allowance to the selected accounts. */
export const bulkGrantVipToUsers = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        userIds: z.array(z.string().uuid()).min(1).max(200),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertVipConsoleRole } = await import("./admin.server");
    await assertVipConsoleRole(context.userId);
    const { bulkGrantVip } = await import("./admin-moderation.server");
    return bulkGrantVip({ ...data, adminId: context.userId });
  });

/** Bulk-retry the ImprovMX alias sync for the selected accounts. */
export const bulkRetryAlias = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z.object({ userIds: z.array(z.string().uuid()).min(1).max(200) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { bulkRetryAliasSync } = await import("./admin-moderation.server");
    return bulkRetryAliasSync({ ...data, adminId: context.userId });
  });

/** Parses a `ROUT-XXXXXX` reference out of a bank message and pre-fills the match. */
export const matchPaymentReference = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => z.object({ text: z.string().max(2000) }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { matchPaymentByReference } = await import("./admin-moderation.server");
    return matchPaymentByReference(data.text);
  });

/** Suspend / unsuspend a public profile. */
export const suspendProfile = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        suspended: z.boolean(),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { setSuspension } = await import("./admin-moderation.server");
    return setSuspension({ ...data, adminId: context.userId });
  });

/** Permanent ban (+ alias freeze) or lift of an existing ban. */
export const banUser = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        banned: z.boolean(),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { setBan } = await import("./admin-moderation.server");
    return setBan({ ...data, adminId: context.userId });
  });

/** Handle change / VIP short-handle grant, synced with ImprovMX. */
export const assignHandle = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        handle: z.string().trim().min(1).max(120),
        vipGrant: z.boolean().optional(),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole, assertVipConsoleRole } = await import("./admin.server");
    if (data.vipGrant) await assertVipConsoleRole(context.userId);
    else await assertAdminRole(context.userId);
    const { changeHandle } = await import("./admin-moderation.server");
    return changeHandle({ ...data, adminId: context.userId });
  });

/** Handle van het gratis aliasprofiel (`rout.be/u/<handle>`) wijzigen. */
export const assignAliasHandle = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        handle: z.string().trim().min(1).max(120),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { changeAliasHandle } = await import("./admin-moderation.server");
    return changeAliasHandle({ ...data, adminId: context.userId });
  });

/** Remove bio text, individual links or reset the avatar. */
export const cleanseProfileContent = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        clearTagline: z.boolean().optional(),
        resetAvatar: z.boolean().optional(),
        removeBlockIndexes: z.array(z.number().int().min(0).max(500)).max(100).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { cleanseContent } = await import("./admin-moderation.server");
    return cleanseContent({ ...data, adminId: context.userId });
  });

/** Range-based server-side pagination for the audit log. */
export const listAuditLogPage = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    pageInput
      .extend({
        adminEmail: z.string().trim().max(200).optional(),
        action: z.string().trim().max(80).optional(),
        from: z.string().trim().max(40).optional(),
        to: z.string().trim().max(40).optional(),
        search: z.string().trim().max(200).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { fetchAuditPage, listAuditActions } = await import("./admin-moderation.server");
    const page = await fetchAuditPage(
      {
        adminEmail: data.adminEmail || undefined,
        action: data.action || undefined,
        from: data.from || undefined,
        to: data.to || undefined,
        search: data.search || undefined,
      },
      data.page ?? 1,
      data.perPage ?? 20,
    );
    return { ...page, actions: await listAuditActions() };
  });

/** Paginated financial records. */
export const listTransactions = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    pageInput
      .extend({ status: z.enum(["paid", "pending", "failed"]).optional() })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { fetchTransactionsPage } = await import("./admin-moderation.server");
    return fetchTransactionsPage(data);
  });

/** ImprovMX alias monitoring. */
export const listAliases = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => pageInput.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { fetchNetworkOverview } = await import("./admin-moderation.server");
    return fetchNetworkOverview(data.page ?? 1, data.perPage ?? 20);
  });

/** Emergency alias pause / resume / delete. */
export const controlUserAlias = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ userId: z.string().uuid(), action: z.enum(["pause", "resume", "delete"]) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { controlAlias } = await import("./admin-moderation.server");
    return controlAlias({ ...data, adminId: context.userId });
  });

/** Bank-name → free handle suggestions for verification name matching. */
export const suggestHandlesForBankName = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z.object({ bankName: z.string().trim().min(2).max(200) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { suggestHandlesFromBankName } = await import("./admin-moderation.server");
    return { suggestions: await suggestHandlesFromBankName(data.bankName) };
  });

/** Bulk moderation across many selected accounts. */
export const bulkModerateUsers = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        userIds: z.array(z.string().uuid()).min(1).max(200),
        action: z.enum(["suspend", "unsuspend", "ban", "cleanse"]),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { bulkModerate } = await import("./admin-moderation.server");
    return bulkModerate({ ...data, adminId: context.userId });
  });

/** Manual payment override — marks an account paid and provisions its alias. */
export const markPaymentManually = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        paid: z.boolean(),
        note: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { markUserPaid } = await import("./admin-moderation.server");
    return markUserPaid({ ...data, adminId: context.userId });
  });

/** Drains the ImprovMX sync queue, or requeues everything that failed. */
export const runAliasSync = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ retryFailed: z.boolean().optional(), userId: z.string().uuid().optional() })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole, writeAudit } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { drainAliasSyncQueue, retryFailedAliasJobs, aliasQueueSummary, requeueUserAlias } =
      await import("./alias-sync.server");
    const { improvmxKey } = await import("./alias.server");

    if (!improvmxKey()) {
      return {
        ok: false as const,
        configured: false as const,
        processed: 0,
        done: 0,
        failed: 0,
        retrying: 0,
        error: "IMPROVMX_API_KEY is not configured in the backend secrets.",
        queue: await aliasQueueSummary(),
      };
    }

    const result = data.userId
      ? await requeueUserAlias(data.userId)
      : data.retryFailed
        ? await retryFailedAliasJobs()
        : await drainAliasSyncQueue(25);

    // Manual retries are admin actions and must land in the audit trail.
    await writeAudit({
      adminId: context.userId,
      action: data.userId
        ? "ALIAS_RETRY_MANUAL"
        : data.retryFailed
          ? "ALIAS_RETRY_FAILED_JOBS"
          : "ALIAS_SYNC_RUN",
      targetUserId: data.userId ?? null,
      notes: `${result.done} synced · ${result.retrying} retrying · ${result.failed} failed`,
    });

    return {
      ok: true as const,
      configured: true as const,
      ...result,
      error: result.lastError ?? null,
      queue: await aliasQueueSummary(),
    };
  });

/** Parsed `ROUT-XXXX` bank references received through the inbound e-mail hook. */
export const listInboundPayments = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => pageInput.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { fetchInboundPayments } = await import("./admin-moderation.server");
    return fetchInboundPayments(data.page ?? 1, data.perPage ?? 20);
  });

/** Re-runs the reference matcher for one inbound bank e-mail. */
export const reprocessInboundPayment = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z.object({ eventId: z.string().trim().min(1).max(200) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { enforceRateLimit } = await import("./rate-limit.server");
    enforceRateLimit(`reprocess:${context.userId}`, 30, 60_000);
    const { reprocessInboundPayment: run } = await import("./admin-moderation.server");
    return run(data.eventId, context.userId);
  });

/** Server-side CSV export of inbound bank references. Only admins can call this. */
export const exportInboundPayments = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        matched: z.boolean().optional(),
        status: z.enum(["paid", "pending", "failed"]).optional(),
      })
      .optional()
      .default({})
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { exportInboundPayments: build } = await import("./admin-moderation.server");
    return build(data);
  });

/**
 * One chunk of the asynchronous inbound-payments export. The client keeps
 * requesting chunks in the background and assembles the download link once the
 * final chunk arrives, so a huge export never blocks a single request.
 */
export const exportInboundChunk = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        page: z.number().int().min(1).max(100_000).optional(),
        perPage: z.number().int().min(20).max(200).optional(),
        matched: z.boolean().optional(),
        status: z.enum(["paid", "pending", "failed"]).optional(),
      })
      .optional()
      .default({})
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { enforceRateLimit } = await import("./rate-limit.server");
    // A full export is ~500 chunks; this ceiling stops runaway loops only.
    enforceRateLimit(`export-chunk:${context.userId}`, 900, 60_000);
    const { assertServiceRole } = await import("./deployment-status.server");
    assertServiceRole();
    const { buildInboundExportChunk } = await import("./admin-exports.server");
    return buildInboundExportChunk({
      page: data.page ?? 1,
      perPage: data.perPage,
      filters: { matched: data.matched, status: data.status },
    });
  });

/* ------------------------------------------------------------------ *
 * Diagnostics, cursor pagination and export audit trail               *
 * ------------------------------------------------------------------ */

/**
 * Configuration checklist for the admin Deployment tab. Deliberately tolerant:
 * it reports missing secrets instead of throwing on them.
 */
export const getDeploymentChecklist = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { getDeploymentStatus } = await import("./deployment-status.server");
    return getDeploymentStatus();
  });

/** Keyset-paginated audit log — constant cost regardless of dataset size. */
export const listAuditLogCursor = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        cursor: z.string().max(400).nullable().optional(),
        perPage: z.number().int().min(10).max(100).optional(),
        adminEmail: z.string().trim().max(200).optional(),
        action: z.string().trim().max(80).optional(),
        from: z.string().trim().max(40).optional(),
        to: z.string().trim().max(40).optional(),
        search: z.string().trim().max(200).optional(),
      })
      .optional()
      .default({})
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole, writeAudit } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { enforceRateLimit, shouldSample } = await import("./rate-limit.server");
    enforceRateLimit(`audit-cursor:${context.userId}`, 120, 60_000);

    const { fetchAuditCursorPage } = await import("./audit-cursor.server");
    const { listAuditActions } = await import("./admin-moderation.server");
    const filters = {
      adminEmail: data.adminEmail || undefined,
      action: data.action || undefined,
      from: data.from || undefined,
      to: data.to || undefined,
      search: data.search || undefined,
    };
    const page = await fetchAuditCursorPage({
      cursor: data.cursor ?? null,
      perPage: data.perPage ?? 20,
      filters,
    });

    // Who searched the trail for what is itself worth recording — but only
    // once a minute per admin, so debounced typing cannot flood the log.
    const active = Object.entries(filters).filter(([, v]) => Boolean(v));
    if (active.length > 0 && shouldSample(`audit-search:${context.userId}`, 60_000)) {
      await writeAudit({
        adminId: context.userId,
        action: "AUDIT_SEARCHED",
        targetLabel: "audit_log",
        notes: active.map(([k, v]) => `${k}=${String(v)}`).join(", "),
      }).catch(() => {});
    }

    return { ...page, actions: await listAuditActions() };
  });

/**
 * Records the lifecycle of an export (start, completion, download) together
 * with the acting admin and the filters that were applied.
 */
export const logExportEvent = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        dataset: z.enum(["inbound_payments", "audit_log", "transactions"]),
        phase: z.enum(["started", "completed", "downloaded", "failed", "expired"]),
        rows: z.number().int().min(0).max(1_000_000).optional(),
        filters: z.record(z.string(), z.unknown()).optional(),
        note: z.string().trim().max(300).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole, writeAudit } = await import("./admin.server");
    await assertAdminRole(context.userId);

    const filters = data.filters ?? {};
    const active = Object.entries(filters).filter(
      ([, v]) => v !== undefined && v !== null && v !== "",
    );

    await writeAudit({
      adminId: context.userId,
      action: `EXPORT_${data.phase.toUpperCase()}`,
      targetLabel: data.dataset,
      notes: [
        typeof data.rows === "number" ? `${data.rows} rows` : null,
        active.length > 0
          ? `filters: ${active.map(([k, v]) => `${k}=${String(v)}`).join(", ")}`
          : "filters: none",
        data.note ?? null,
      ]
        .filter(Boolean)
        .join(" · "),
    });

    return { ok: true as const };
  });

/** Role probe for the VIP console — admin or security only. */
export const myVipConsoleRole = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { resolveVipConsoleRole } = await import("./admin.server");
    const role = await resolveVipConsoleRole(context.userId);
    return { role, allowed: role !== null };
  });

/** Profiles holding an active VIP short-handle grant, incl. ImprovMX sync state. */
export const listVipGrants = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { assertVipConsoleRole } = await import("./admin.server");
    await assertVipConsoleRole(context.userId);
    const { listVipGrants: fetchGrants } = await import("./admin-moderation.server");
    return fetchGrants();
  });

/** Revoke a VIP short-handle grant, with a mandatory justification. */
export const revokeVipGrant = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertVipConsoleRole } = await import("./admin.server");
    await assertVipConsoleRole(context.userId);
    const { revokeVipGrant: revoke } = await import("./admin-moderation.server");
    return revoke({ userId: data.userId, adminId: context.userId, reason: data.reason });
  });

/** Bulk allocation of 3–4 character handles from a CSV / textarea payload. */
export const bulkGrantVipHandles = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        input: z.string().trim().min(1).max(20_000),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertVipConsoleRole } = await import("./admin.server");
    await assertVipConsoleRole(context.userId);
    const { bulkGrantVipHandles: runBulk } = await import("./admin-moderation.server");
    return runBulk({ input: data.input, reason: data.reason ?? null, adminId: context.userId });
  });

/** Filterable VIP audit trail: handle, admin, action and date range. */
export const listVipAuditLog = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        handle: z.string().trim().max(80).optional(),
        adminEmail: z.string().trim().max(200).optional(),
        action: z.string().trim().max(60).optional(),
        from: z.string().trim().max(40).optional(),
        to: z.string().trim().max(40).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { assertVipConsoleRole } = await import("./admin.server");
    await assertVipConsoleRole(context.userId);
    const { fetchVipAuditLog } = await import("./admin-moderation.server");
    return fetchVipAuditLog(data);
  });

/** Requeue the ImprovMX alias job for one VIP account. */
export const retryVipAliasSync = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertVipConsoleRole, writeAudit } = await import("./admin.server");
    await assertVipConsoleRole(context.userId);
    const { requeueUserAlias } = await import("./alias-sync.server");
    const { improvmxKey } = await import("./alias.server");
    if (!improvmxKey()) {
      return {
        ok: false as const,
        error: "IMPROVMX_API_KEY is not configured in the backend secrets.",
      };
    }
    const result = await requeueUserAlias(data.userId);
    await writeAudit({
      adminId: context.userId,
      action: "vip_alias_retry",
      targetUserId: data.userId,
      notes: `${result.done} synced · ${result.failed} failed`,
    });
    return { ok: true as const, ...result, error: result.lastError ?? null };
  });

/** Operationele kerncijfers voor het admin-overzicht (alleen aggregaten). */
export const adminOverview = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { fetchAdminOverview } = await import("./admin-overview.server");
    return fetchAdminOverview();
  });
