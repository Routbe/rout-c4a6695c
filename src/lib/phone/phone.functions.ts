import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";
import { normalizePhone } from "./otp-rules";

export const getPhoneStatus = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { phoneStatus } = await import("./phone-otp.server");
    return phoneStatus(context.userId);
  });

export const requestPhoneVerification = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z.object({ countryCode: z.string().max(5), number: z.string().max(20) }).strict().parse(data),
  )
  .handler(async ({ data, context }) => {
    const phone = normalizePhone(data.countryCode, data.number);
    if (!phone) return { status: "invalid_number" as const };
    const { getRequest } = await import("@tanstack/react-start/server");
    const { clientIp } = await import("@/lib/rate-limit-db.server");
    const { requestPhoneCode } = await import("./phone-otp.server");
    return requestPhoneCode(context.userId, phone, clientIp(getRequest()));
  });

export const confirmPhoneVerification = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => z.object({ code: z.string().regex(/^\d{6}$/) }).strict().parse(data))
  .handler(async ({ data, context }) => {
    const { verifyPhoneCode } = await import("./phone-otp.server");
    return verifyPhoneCode(context.userId, data.code);
  });

export const removePhoneNumber = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { removePhone } = await import("./phone-otp.server");
    await removePhone(context.userId);
    return { ok: true };
  });
