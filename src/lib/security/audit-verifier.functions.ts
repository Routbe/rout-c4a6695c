import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";
export const getDisclosureAudit = createServerFn({ method: "GET" }).middleware([requireAuth]).handler(async ({ context }) => {
  const { verifyUserDisclosures } = await import("./audit-verifier.server");
  return verifyUserDisclosures(context.userId);
});