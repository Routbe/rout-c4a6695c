import { createServerFn } from "@tanstack/react-start";

/**
 * Gateway sluice for `/`: tells the root loader whether the request carries a
 * valid session, so signed-in members get a server-side redirect to their
 * cockpit before any marketing HTML is produced. Returns only a boolean.
 */
export const getGatewaySession = createServerFn({ method: "GET" }).handler(async () => {
  const { currentUser } = await import("@/lib/auth/session.server");
  const user = await currentUser().catch(() => null);
  return { signedIn: Boolean(user) };
});
