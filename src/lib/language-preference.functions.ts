import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";

/** Central language preference, stored on the member's own profile row. */
export const getPreferredLanguage = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { readPreferredLanguage } = await import("./language-preference.server");
    return { locale: await readPreferredLanguage(context.userId) };
  });

export const savePreferredLanguage = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { locale: string }) => input)
  .handler(async ({ data, context }) => {
    const { writePreferredLanguage } = await import("./language-preference.server");
    try {
      await writePreferredLanguage(context.userId, data.locale);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : "save_failed",
      };
    }
  });
