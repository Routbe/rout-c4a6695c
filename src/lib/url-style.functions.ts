import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";

/** The member's preferred display shape for their profile URL. */
export const getUrlStyle = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { readUrlStyle } = await import("./url-style.server");
    return { urlStyle: await readUrlStyle(context.userId) };
  });

export const saveUrlStyle = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { style: string }) => input)
  .handler(async ({ data, context }) => {
    const { writeUrlStyle } = await import("./url-style.server");
    try {
      await writeUrlStyle(context.userId, data.style);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : "save_failed",
      };
    }
  });
