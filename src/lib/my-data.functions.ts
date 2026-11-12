import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const exportMyDataFn = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { ensureStepUpSession } = await import("@/lib/auth/step-up.server");
    await ensureStepUpSession(context.userId, "vault_export");
    const { exportMyData } = await import("./my-data.server");
    return (await exportMyData(context.userId)) as unknown as Record<string, JsonValue>;
  });

export const deleteMyAccountFn = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { ensureStepUpSession } = await import("@/lib/auth/step-up.server");
    await ensureStepUpSession(context.userId, "account_delete");
    const { deleteMyAccountData } = await import("./my-data.server");
    try {
      await deleteMyAccountData(context.userId);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : "delete_failed",
      };
    }
  });
