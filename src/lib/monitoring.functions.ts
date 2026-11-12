import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

/** Admin-only: recent Stripe/SEPA webhook deliveries with payload and errors. */
export const listWebhookEvents = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(500).optional(),
        status: z.enum(["all", "success", "failed", "processing", "received"]).optional(),
        search: z.string().max(200).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { fetchWebhookEvents } = await import("./monitoring.server");
    return fetchWebhookEvents({
      limit: data.limit ?? 100,
      status: data.status ?? "all",
      search: data.search ?? null,
    });
  });

/** The signed-in member's own referral funnel (visits → sign-ups → conversion). */
export const getReferralAnalytics = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.db
      .from("profiles")
      .select("username")
      .eq("id", context.userId)
      .maybeSingle();
    const { fetchReferralAnalytics } = await import("./monitoring.server");
    return fetchReferralAnalytics(context.userId, (profile?.username as string | null) ?? null);
  });
