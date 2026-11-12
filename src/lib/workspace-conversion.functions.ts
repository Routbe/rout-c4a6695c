import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";
import { conversionDetailsSchema } from "./workspace-conversion-rules";

async function req() {
  const { getRequest } = await import("@tanstack/react-start/server");
  try {
    return getRequest();
  } catch {
    return null;
  }
}

export const getConversionPreflight = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { preflight, getOpenTransfer } = await import("./workspace-conversion.server");
    const [summary, open] = await Promise.all([preflight(context.userId), getOpenTransfer(context.userId)]);
    return {
      summary,
      open: open
        ? { status: open.status, targetEmail: open.target_email, workspaceName: open.workspace_name, otpVerified: Boolean(open.otp_verified_at), accepted: Boolean(open.accepted_at) }
        : null,
    };
  });

export const startWorkspaceConversion = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({
    workspaceName: z.string().trim().min(1).max(80),
    target: z.string().trim().min(3).max(254),
    details: conversionDetailsSchema,
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { startConversion } = await import("./workspace-conversion.server");
    return startConversion({ id: context.userId, email: context.user.email }, data, await req());
  });

export const confirmWorkspaceConversionCode = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ code: z.string().trim().regex(/^\d{6}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { verifyConversionCode } = await import("./workspace-conversion.server");
    return verifyConversionCode(context.userId, data.code, await req());
  });

export const describeWorkspaceTransfer = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token: z.string().min(40).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const { describeTransfer } = await import("./workspace-conversion.server");
    return describeTransfer(data.token);
  });

export const acceptWorkspaceTransfer = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ token: z.string().min(40).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const { acceptTransfer } = await import("./workspace-conversion.server");
    return acceptTransfer(context.user, data.token);
  });

/** Sunset accounts read this to show how long their login keeps working. */
export const getSunsetStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { currentUser } = await import("@/lib/auth/session.server");
  const user = await currentUser().catch(() => null);
  if (!user) return null;
  const { sunsetStatus, claimPendingTransfersForEmail } = await import("./workspace-conversion.server");
  const status = await sunsetStatus(user.id);
  if (!status) await claimPendingTransfersForEmail(user).catch(() => undefined);
  return status;
});
