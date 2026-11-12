import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";

/** Reads the caller's own account status (active / frozen / …). */
export const getAccountStatus = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { readAccountStatus } = await import("./account-status.server");
    return { status: await readAccountStatus(context.userId) };
  });

/** Pauses or resumes the caller's own account. */
export const setMyAccountStatus = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { status: "active" | "frozen" }) => {
    if (input?.status !== "active" && input?.status !== "frozen") {
      throw new Error("invalid_status");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { setAccountStatus } = await import("./account-status.server");
    return { status: await setAccountStatus(context.userId, data.status) };
  });
