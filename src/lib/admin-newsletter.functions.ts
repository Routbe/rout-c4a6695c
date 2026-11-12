import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";

/** Admin console: signup-block counts (never subscriber addresses). */
export const adminNewsletterOverview = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { fetchNewsletterOverview } = await import("./admin-newsletter.server");
    return fetchNewsletterOverview();
  });
