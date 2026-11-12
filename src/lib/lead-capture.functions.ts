import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Publieke RPC voor het contactformulier-blok op profielpagina's. */
const schema = z.object({
  handle: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .transform((v) => v.replace(/^@+/, "").toLowerCase()),
  name: z.string().trim().max(120).optional().nullable(),
  email: z.string().trim().toLowerCase().email().max(200),
  message: z.string().trim().max(1000).optional().nullable(),
  altcha: z.string().max(4000).optional().nullable(),
});

export const submitLeadCapture = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data }) => {
    const { assertHuman } = await import("./altcha.server");
    await assertHuman(data.altcha ?? null);
    const { captureLead } = await import("./lead-capture.server");
    return captureLead({
      handle: data.handle,
      name: data.name?.trim() || null,
      email: data.email,
      message: data.message?.trim() || null,
    });
  });
