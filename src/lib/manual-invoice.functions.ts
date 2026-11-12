import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

const schema = z.object({
  title: z.string().trim().min(2).max(80),
  lines: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(80),
        amountCents: z.number().int().min(0).max(10_000_000),
      }),
    )
    .max(20)
    .default([]),
  note: z.string().trim().max(400).nullable().default(null),
  /** Eigen bestand, base64 zonder data-URL-prefix (max ±4 MB). */
  fileBase64: z.string().max(6_000_000).nullable().default(null),
  fileName: z.string().max(120).nullable().default(null),
});

/** Maakt een factuur/document aan en mailt het naar het lid zelf. */
export const sendManualInvoice = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { enforceRateLimit } = await import("./rate-limit.server");
    enforceRateLimit(`invoices:manual:${context.userId}`, 6, 60_000);
    const { createAndSendManualInvoice } = await import("./manual-invoice.server");
    return createAndSendManualInvoice(context.userId, {
      title: data.title,
      lines: data.lines,
      note: data.note,
      fileBase64: data.fileBase64,
      fileName: data.fileName,
    });
  });
