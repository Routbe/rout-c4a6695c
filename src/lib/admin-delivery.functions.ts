import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

/** Adminlijst met de factuur-/mailstatus per betaling. */
export const listInvoiceDeliveries = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z.object({ onlyFailed: z.boolean().default(false) }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { fetchDeliveries } = await import("./admin-delivery.server");
    return fetchDeliveries(data.onlyFailed);
  });

/** Draait factuur-PDF + Brevo-mail opnieuw voor één betaling. */
export const retryInvoiceDelivery = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => z.object({ paymentId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("./admin.server");
    await assertAdminRole(context.userId);
    const { retryDelivery } = await import("./admin-delivery.server");
    return retryDelivery(data.paymentId);
  });
