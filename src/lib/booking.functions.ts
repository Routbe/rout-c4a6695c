import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Publieke RPC voor de boekingswidget op profielpagina's. */
const schema = z.object({
  handle: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .transform((v) => v.replace(/^@+/, "").toLowerCase()),
  guestName: z.string().trim().min(2).max(120),
  guestEmail: z.string().trim().toLowerCase().email().max(200),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  preferredTime: z.string().regex(/^\d{2}:\d{2}$/),
  guestMessage: z.string().trim().max(500).optional().nullable(),
  altcha: z.string().max(4000).optional().nullable(),
});

export const requestBooking = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data }) => {
    await (await import("@/lib/platform-features.server")).assertPlatformFeature("bookings");
    const today = new Date().toISOString().slice(0, 10);
    if (data.preferredDate < today) {
      return { ok: false, message: "Kies een datum in de toekomst." };
    }
    const { assertHuman } = await import("./altcha.server");
    await assertHuman(data.altcha ?? null);
    const { createBookingRequest } = await import("./booking.server");
    return createBookingRequest({
      handle: data.handle,
      guestName: data.guestName,
      guestEmail: data.guestEmail,
      preferredDate: data.preferredDate,
      preferredTime: data.preferredTime,
      guestMessage: data.guestMessage ?? null,
    });
  });
