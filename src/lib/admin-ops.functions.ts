import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

/** Admin console: short links (tracked QR codes). */
export const adminListShortLinks = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        search: z.string().max(120).default(""),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    const { fetchShortLinks } = await import("./admin-ops.server");
    await assertAdminRole(context.userId);
    const { enforceRateLimit } = await import("./rate-limit.server");
    enforceRateLimit(`admin-ops:list:${context.userId}`, 60, 60_000);
    return fetchShortLinks(data.search, data.limit);
  });

export const adminUpdateShortLink = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        slug: z
          .string()
          .min(2)
          .max(64)
          .regex(/^[a-zA-Z0-9-_]+$/)
          .optional(),
        label: z.string().max(120).nullable().optional(),
        targetUrl: z.string().url().max(2048).optional(),
        isActive: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    const { patchShortLink } = await import("./admin-ops.server");
    await assertAdminRole(context.userId);
    const { enforceRateLimit } = await import("./rate-limit.server");
    enforceRateLimit(`admin-ops:write:${context.userId}`, 60, 60_000);
    const { id, ...patch } = data;
    return patchShortLink(id, patch);
  });

export const adminDeleteShortLink = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    const { removeShortLink } = await import("./admin-ops.server");
    await assertAdminRole(context.userId);
    const { enforceRateLimit } = await import("./rate-limit.server");
    enforceRateLimit(`admin-ops:write:${context.userId}`, 60, 60_000);
    return removeShortLink(data.id);
  });

/** Admin console: QR scan counters. */
export const adminScanSummary = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => z.object({ trackedQrId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    const { fetchScanSummary } = await import("./admin-ops.server");
    await assertAdminRole(context.userId);
    return fetchScanSummary(data.trackedQrId);
  });

export const adminPurgeScans = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        trackedQrId: z.string().uuid(),
        olderThanDays: z.number().int().min(1).max(3650).nullable().default(null),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    const { purgeScans } = await import("./admin-ops.server");
    await assertAdminRole(context.userId);
    const { enforceRateLimit } = await import("./rate-limit.server");
    enforceRateLimit(`admin-ops:write:${context.userId}`, 60, 60_000);
    return purgeScans(data.trackedQrId, data.olderThanDays);
  });

/** Admin console: badges. */
export const adminListBadges = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { assertAdminRole } = await import("./admin.server");
    const { fetchBadges } = await import("./admin-ops.server");
    await assertAdminRole(context.userId);
    return fetchBadges();
  });

export const adminGrantBadge = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z.object({ userId: z.string().uuid(), badgeSlug: z.string().min(1).max(64) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    const { grantBadge } = await import("./admin-ops.server");
    await assertAdminRole(context.userId);
    const { enforceRateLimit } = await import("./rate-limit.server");
    enforceRateLimit(`admin-ops:write:${context.userId}`, 60, 60_000);
    return grantBadge(data.userId, data.badgeSlug, context.userId);
  });

export const adminRevokeBadge = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z.object({ userId: z.string().uuid(), badgeSlug: z.string().min(1).max(64) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    const { revokeBadge } = await import("./admin-ops.server");
    await assertAdminRole(context.userId);
    const { enforceRateLimit } = await import("./rate-limit.server");
    enforceRateLimit(`admin-ops:write:${context.userId}`, 60, 60_000);
    return revokeBadge(data.userId, data.badgeSlug);
  });

/** Admin: open phone verifications (international numbers, manual queue). */
export const adminListPhoneVerifications = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { listPendingPhoneVerifications } = await import("./phone/phone-otp.server");
    return listPendingPhoneVerifications();
  });

export const adminApprovePhoneVerification = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { approvePhoneVerification } = await import("./phone/phone-otp.server");
    return { ok: await approvePhoneVerification(data.id) };
  });
