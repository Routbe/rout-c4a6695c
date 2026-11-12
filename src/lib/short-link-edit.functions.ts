import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";
import { shortLinkTargetBlocked } from "@/lib/short-link-target";

const inputSchema = z.object({
  id: z.string().uuid(),
  targetUrl: z
    .string()
    .trim()
    .min(1, "Voer een bestemming in.")
    .max(2048, "URL is te lang.")
    .refine((v) => {
      try {
        return new URL(v).protocol === "https:";
      } catch {
        return false;
      }
    }, "Alleen https://-URL's zijn toegestaan.")
    .refine((v) => !shortLinkTargetBlocked(v), "Deze bestemming is niet toegestaan."),
});

/**
 * Bewerkt enkel de doel-URL van een bestaande short link / QR-code (`tracked_qrs`).
 * De slug (en dus de QR-afbeelding en short link) blijft ongewijzigd.
 * Auth-verplicht en scoped op `user_id`, zodat je alleen je eigen routes bewerkt.
 */
export const updateShortLinkTarget = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { updateTrackedQrTarget } = await import("./short-links.server");
    return updateTrackedQrTarget(context.userId, data.id, data.targetUrl);
  });
