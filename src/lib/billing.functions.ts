import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

/** Facturatiegeschiedenis van het ingelogde lid. */
export const listMyInvoices = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { enforceRateLimit } = await import("./rate-limit.server");
    enforceRateLimit(`invoices:list:${context.userId}`, 30, 60_000);
    const { fetchMyInvoices } = await import("./billing.server");
    return { invoices: await fetchMyInvoices(context.userId) };
  });

/** Bouwt één historische factuur opnieuw op als PDF (base64). */
export const downloadMyInvoice = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => z.object({ paymentId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { enforceRateLimit } = await import("./rate-limit.server");
    enforceRateLimit(`invoices:pdf:${context.userId}`, 12, 60_000);
    const { buildInvoicePdf } = await import("./billing.server");
    const pdf = await buildInvoicePdf(context.userId, data.paymentId);
    if (!pdf) return { ok: false as const, reason: "not_found" as const };
    return { ok: true as const, ...pdf };
  });
