import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";

/** Opaque one-time tickets issued only after the server verifies a Fediverse OAuth callback. */
export function fediverseSession() {
  return {
    id: "rout-fediverse-session",
    endpoints: {
      verifyFediverseSession: createAuthEndpoint("/fediverse/verify", { method: "GET" }, async ctx => {
        const ticket = new URL(ctx.request?.url ?? "http://localhost").searchParams.get("ticket");
        if (!ticket || !/^[0-9a-f-]{36}$/.test(ticket)) throw new APIError("UNAUTHORIZED", { message: "Invalid sign-in" });
        const key = `rout-fedi:${ticket}`;
        const v = await ctx.context.internalAdapter.consumeVerificationValue(key);
        if (!v || new Date(v.expiresAt).getTime() <= Date.now()) throw new APIError("UNAUTHORIZED", { message: "Expired sign-in" });
        const user = await ctx.context.internalAdapter.findUserById(v.value);
        if (!user) throw new APIError("UNAUTHORIZED", { message: "Account unavailable" });
        const session = await ctx.context.internalAdapter.createSession(user.id);
        if (!session) throw new APIError("UNAUTHORIZED", { message: "Session unavailable" });
        await setSessionCookie(ctx, { user, session });
        ctx.context.setNewSession({ user, session });
        throw ctx.redirect("/auth/continue");
      }),
    },
  };
}