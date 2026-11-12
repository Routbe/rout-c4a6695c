import { createMiddleware } from "@tanstack/react-start";

/**
 * Server-function auth for ROUT.
 *
 * The session comes from Neon Auth (read through the same-origin proxy) and is
 * bridged onto the existing `public.users` row, so `userId` on the context is
 * the same id every table already references.
 */
export const requireAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { currentUser } = await import("./session.server");
  const user = await currentUser();
  if (!user) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  // Converted accounts keep full access during their 30-day sunset (as admin of the new workspace).
  const { createUserDb } = await import("@/lib/db/user-client.server");
  const db = createUserDb(user.id);
  const claims = {
    sub: user.id,
    email: user.email,
    email_confirmed_at: user.emailConfirmedAt,
    email_verified: Boolean(user.emailConfirmedAt),
  };
  const { withDbContext } = await import("@/lib/neon");
  const workspaceId = await activeWorkspaceCookie();
  return withDbContext({ userId: user.id, workspaceId }, async () => {
    return next({ context: { userId: user.id, user, claims, db } });
  });
});

/** Same lookup, but anonymous callers are allowed through with `userId: null`. */
export const optionalAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { currentUser } = await import("./session.server");
  const user = await currentUser().catch(() => null);
  const { createUserDb } = await import("@/lib/db/user-client.server");
  const db = user ? createUserDb(user.id) : null;
  const claims = user
    ? {
        sub: user.id,
        email: user.email,
        email_confirmed_at: user.emailConfirmedAt,
        email_verified: Boolean(user.emailConfirmedAt),
      }
    : null;
  const run = () => next({ context: { userId: user?.id ?? null, user, claims, db } });
  if (!user) return run();
  const { withDbContext } = await import("@/lib/neon");
  const workspaceId = await activeWorkspaceCookie();
  return withDbContext({ userId: user.id, workspaceId }, run);
});

/** Informational only: RLS policies never trust it, membership is always checked. */
async function activeWorkspaceCookie(): Promise<string | null> {
  try {
    const { readRequestCookie } = await import("@/lib/request-context");
    const { ACTIVE_WORKSPACE_COOKIE } = await import("@/lib/workspaces.server");
    return readRequestCookie(ACTIVE_WORKSPACE_COOKIE) ?? null;
  } catch {
    return null;
  }
}
