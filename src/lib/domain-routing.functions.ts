import { createServerFn } from "@tanstack/react-start";

/**
 * Resolves the incoming request host to a ROUT handle when a member has mapped
 * their own (verified) domain to their profile. Public by design: it only ever
 * exposes the handle that the domain owner chose to publish.
 */
export const resolveHostProfile = createServerFn({ method: "GET" }).handler(async () => {
  const { getRequestHost } = await import("@tanstack/react-start/server");
  let host = "";
  try {
    host = getRequestHost() ?? "";
  } catch {
    return { handle: null as string | null };
  }
  if (!host) return { handle: null as string | null };

  try {
    const { findHandleForHost } = await import("./domains.server");
    return { handle: await findHandleForHost(host) };
  } catch {
    return { handle: null as string | null };
  }
});
