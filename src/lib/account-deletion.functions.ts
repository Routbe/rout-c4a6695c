import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

export const getMyDeletion = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { getDeletion } = await import("./account-deletion.server");
    const { isPending } = await import("./account-deletion-rules");
    const row = await getDeletion(context.userId);
    return isPending(row) ? { pending: true as const, purgeAfter: new Date(row!.purgeAfter).toISOString() } : { pending: false as const };
  });

/** Starts the 7-day grace period. Requires a fresh e-mail security code (step-up). */
export const requestMyDeletion = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().regex(/^\d{6}$/) }).strict().parse(d))
  .handler(async ({ data, context }) => {
    const { ensureStepUpSession } = await import("@/lib/auth/step-up.server");
    await ensureStepUpSession(context.userId, "account_delete");
    const { consumeSecurityCode } = await import("./security-code.server");
    if (!(await consumeSecurityCode(context.userId, "delete_account", data.code))) {
      throw new Error("De beveiligingscode klopt niet of is verlopen.");
    }
    const { requestDeletion } = await import("./account-deletion.server");
    const row = await requestDeletion(context.userId);
    return { purgeAfter: row ? new Date(row.purgeAfter).toISOString() : null };
  });

export const cancelMyDeletion = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { cancelDeletion } = await import("./account-deletion.server");
    return { ok: await cancelDeletion(context.userId) };
  });
