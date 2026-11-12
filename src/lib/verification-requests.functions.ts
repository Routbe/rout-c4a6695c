import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

/**
 * Server-functies voor bedrijfs- en influencerverificatie.
 * De aanvraag van een lid en de wachtrij voor beheerders.
 */

const businessSchema = z.strictObject({
  companyName: z.string().min(2).max(160),
  legalForm: z.string().max(80).nullable().optional(),
  vatNumber: z.string().min(6).max(20),
  address: z.string().max(240).nullable().optional(),
  country: z.string().max(2).nullable().optional(),
  websiteDomain: z.string().min(4).max(120),
  contactName: z.string().max(120).nullable().optional(),
  contactEmail: z.string().email().max(160).nullable().optional(),
});

export const requestBusinessVerification = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => businessSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { submitBusinessRequest } = await import("./verification-requests.server");
    const res = await submitBusinessRequest(context.userId, data);
    const id = (res as { request?: { id?: unknown } | null }).request?.id;
    if (res.ok && typeof id === "string") {
      const { notifyIntake } = await import("./approved-handles.server");
      await notifyIntake(context.userId, "business", data.companyName, id);
    }
    return res;
  });

export const getMyBusinessRequest = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { myBusinessRequest } = await import("./verification-requests.server");
    return myBusinessRequest(context.userId);
  });

const influencerSchema = z.strictObject({
  handleChoices: z.array(z.string().max(40)).min(1).max(4),
  socialLinks: z.array(z.string().max(200)).min(1).max(8),
  motivation: z.string().max(600).nullable().optional(),
});

export const requestInfluencerVerification = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => influencerSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { submitInfluencerRequest } = await import("./verification-requests.server");
    const res = await submitInfluencerRequest(context.userId, data);
    const id = res.ok ? (res.request as { id?: unknown } | null)?.id : null;
    if (res.ok && typeof id === "string") {
      const { notifyIntake } = await import("./approved-handles.server");
      await notifyIntake(context.userId, "influencer", data.handleChoices[0] ?? "influencer", id);
    }
    return res;
  });

export const getMyInfluencerRequest = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { myInfluencerRequest } = await import("./verification-requests.server");
    return myInfluencerRequest(context.userId);
  });

/* ─────────────────────────── beheer ─────────────────────────── */

const statusInput = z.object({ status: z.string().max(24).optional() });

export const adminListBusinessRequests = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => statusInput.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { listBusinessRequests } = await import("./verification-requests.server");
    return listBusinessRequests(data.status ?? "pending");
  });

export const adminListInfluencerRequests = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => statusInput.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { listInfluencerRequests } = await import("./verification-requests.server");
    return listInfluencerRequests(data.status ?? "pending");
  });

async function mailApproval(kind: "influencer" | "business", requestId: string, r: { ok: boolean; handle?: string | null }) {
  if (!r.ok) return;
  const { sql } = await import("./neon");
  const rows = (kind === "business"
    ? await sql`select user_id from public.business_verifications where id = ${requestId}`
    : await sql`select user_id from public.influencer_requests where id = ${requestId}`) as Record<string, unknown>[];
  const uid = rows[0]?.["user_id"];
  if (typeof uid !== "string") return;
  const { sendDecision } = await import("./verification-mail.server");
  await sendDecision(uid, kind, { approved: true, handle: r.handle ?? null });
}

const reviewInput = z.object({
  requestId: z.string().uuid(),
  approve: z.boolean(),
  handle: z.string().max(60).nullable().optional(),
  note: z.string().max(400).nullable().optional(),
});

export const adminReviewBusinessRequest = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => reviewInput.parse(data))
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { approveBusinessRequest, rejectBusinessRequest } = await import(
      "./verification-requests.server"
    );
    return data.approve
      ? approveBusinessRequest(data.requestId, context.userId).then(async (r) => {
          await mailApproval("business", data.requestId, r);
          return r;
        })
      : rejectBusinessRequest(data.requestId, context.userId, data.note ?? null).then(async (r) => {
          const { sql } = await import("./neon");
          const table: string = "business_verifications";
          const rows = (table === "business_verifications"
            ? await sql`select user_id from public.business_verifications where id = ${data.requestId}`
            : await sql`select user_id from public.influencer_requests where id = ${data.requestId}`) as Record<string, unknown>[];
          const uid = rows[0]?.["user_id"];
          if (typeof uid === "string") {
            const { notifyRejected } = await import("./approved-handles.server");
            await notifyRejected(uid, "business", data.note ?? null);
          }
          return r;
        });
  });

export const adminReviewInfluencerRequest = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => reviewInput.parse(data))
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { approveInfluencerRequest, rejectInfluencerRequest } = await import(
      "./verification-requests.server"
    );
    return data.approve
      ? approveInfluencerRequest(data.requestId, context.userId, data.handle ?? null).then(async (r) => {
          await mailApproval("influencer", data.requestId, r);
          return r;
        })
      : rejectInfluencerRequest(data.requestId, context.userId, data.note ?? null).then(async (r) => {
          const { sql } = await import("./neon");
          const table: string = "influencer_requests";
          const rows = (table === "business_verifications"
            ? await sql`select user_id from public.business_verifications where id = ${data.requestId}`
            : await sql`select user_id from public.influencer_requests where id = ${data.requestId}`) as Record<string, unknown>[];
          const uid = rows[0]?.["user_id"];
          if (typeof uid === "string") {
            const { notifyRejected } = await import("./approved-handles.server");
            await notifyRejected(uid, "influencer", data.note ?? null);
          }
          return r;
        });
  });

/* ───────────────────── whitelist, claim en persoon ───────────────────── */

export const adminApproveWithWhitelist = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z.object({
      kind: z.enum(["influencer", "business"]),
      requestId: z.string().uuid(),
      handles: z.array(z.string().trim().min(1).max(60)).max(8),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { approveWithWhitelist } = await import("./approved-handles.server");
    return approveWithWhitelist(data.kind, data.requestId, context.userId, data.handles);
  });

export const getMyApprovedHandles = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { myApprovedHandles } = await import("./approved-handles.server");
    return myApprovedHandles(context.userId);
  });

export const claimApprovedHandle = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => z.object({ handle: z.string().trim().min(1).max(60) }).parse(data))
  .handler(async ({ data, context }) => {
    const { claimHandle } = await import("./approved-handles.server");
    return claimHandle(context.userId, data.handle);
  });

export const adminFindAccount = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => z.object({ query: z.string().trim().min(2).max(160) }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { findAccount } = await import("./approved-handles.server");
    return findAccount(data.query);
  });
