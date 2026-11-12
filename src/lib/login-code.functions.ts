import { createServerFn } from "@tanstack/react-start";

/** Public on purpose (the user is not signed in yet); rate-limited per email. */
export const redeemLoginCodeFn = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string; code: string }) => ({
    email: String(input?.email ?? "").slice(0, 254),
    code: String(input?.code ?? "").slice(0, 12),
  }))
  .handler(async ({ data }) => {
    const { redeemLoginCode } = await import("@/lib/login-code.server");
    return redeemLoginCode(data.email, data.code);
  });
