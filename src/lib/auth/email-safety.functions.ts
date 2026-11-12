import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./middleware";
const tokenInput = (d: unknown) => z.object({ token: z.string().min(32).max(200) }).strict().parse(d);
export const startPrimaryEmailChange = createServerFn({ method: "POST" }).middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ email: z.string().trim().toLowerCase().email().max(254) }).strict().parse(d))
  .handler(async ({ data, context }) => {
    const { requestPrimaryEmailChange } = await import("./email-safety.server");
    return requestPrimaryEmailChange(context.userId, data.email);
  });
export const confirmEmailChange = createServerFn({ method: "POST" }).middleware([requireAuth]).inputValidator(tokenInput)
  .handler(async ({ data, context }) => {
    const { confirmPrimaryEmailChange } = await import("./email-safety.server");
    return confirmPrimaryEmailChange(context.userId, data.token);
  });
export const emergencyFreezeEmailChange = createServerFn({ method: "POST" }).inputValidator(tokenInput)
  .handler(async ({ data }) => {
    const { freezeEmailChange } = await import("./email-safety.server");
    return freezeEmailChange(data.token);
  });