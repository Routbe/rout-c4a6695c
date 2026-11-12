import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireAuth } from "@/lib/auth/middleware";

type Purpose = "merge" | "two_factor" | "delete_account" | "identity_link";
const PURPOSES: Purpose[] = ["merge", "two_factor", "delete_account", "identity_link"];

/** E-mails a 6-digit code to the member's own address. */
export const requestSecurityCode = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { purpose: Purpose }) => {
    if (!PURPOSES.includes(input?.purpose)) throw new Error("bad_purpose");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { issueSecurityCode } = await import("./security-code.server");
    return issueSecurityCode(context.userId, data.purpose, getRequest());
  });

/** Confirms a code (used before 2FA changes on passwordless accounts). */
export const confirmSecurityCode = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { purpose: Purpose; code: string }) => {
    if (!PURPOSES.includes(input?.purpose)) throw new Error("bad_purpose");
    return { purpose: input.purpose, code: String(input.code ?? "").slice(0, 12) };
  })
  .handler(async ({ data, context }) => {
    const { consumeSecurityCode } = await import("./security-code.server");
    return { ok: await consumeSecurityCode(context.userId, data.purpose, data.code) };
  });

