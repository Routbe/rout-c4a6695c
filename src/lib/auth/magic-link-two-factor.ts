/**
 * Better Auth plugin: second sign-in step for e-mail links + second-step options.
 *
 * The two-factor plugin only intercepts password sign-in. An e-mail link is a
 * first factor too, so for members with 2FA switched on this hook turns the
 * fresh session from `/magic-link/verify` back into a pending two-factor
 * challenge (same cookie + verification rows the two-factor plugin uses), and
 * sends the browser to the sign-in page to finish the second step.
 *
 * `GET /two-factor/options` tells the sign-in page which second steps exist for
 * the pending challenge (or the signed-in member), without exposing secrets.
 */
import { APIError, createAuthEndpoint, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { deleteSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import { secondFactorMethods, type SecondFactorFacts } from "./sign-in-policy";

const TWO_FACTOR_COOKIE = "two_factor";
const CHALLENGE_MAX_AGE_S = 600;

export const SECOND_FACTOR_PAGE = "/auth/sign-in?second_factor=1";

type Options = {
  /** Facts about a Better Auth user's second factors. */
  describe: (authUserId: string) => Promise<SecondFactorFacts>;
  /** Where the browser finishes the second step. */
  secondFactorPage?: string;
};

type Ctx = {
  context: {
    newSession?: { user: { id: string; twoFactorEnabled?: boolean | null }; session: { token: string } } | null;
    setNewSession: (s: null) => void;
    secret: string;
    createAuthCookie: (name: string, o?: { maxAge?: number }) => { name: string; attributes: Record<string, unknown> };
    internalAdapter: {
      deleteSession: (token: string) => Promise<void>;
      createVerificationValue: (v: { value: string; identifier: string; expiresAt: Date }) => Promise<unknown>;
      findVerificationValue: (identifier: string) => Promise<{ value: string; expiresAt: Date } | null>;
    };
    session?: { user: { id: string } } | null;
  };
  setSignedCookie: (name: string, value: string, secret: string, attrs: Record<string, unknown>) => Promise<unknown>;
  getSignedCookie: (name: string, secret: string) => Promise<string | null | false>;
  redirect: (url: string) => Error;
  json: (body: unknown) => unknown;
};

export function magicLinkTwoFactor(options: Options) {
  const page = options.secondFactorPage ?? SECOND_FACTOR_PAGE;
  return {
    id: "rout-magic-link-two-factor",
    hooks: {
      after: [
        {
          matcher: (context: { path?: string }) => context.path === "/magic-link/verify" || context.path === "/fediverse/verify" || /^\/(?:oauth2\/)?callback\//.test(context.path ?? ""),
          handler: createAuthMiddleware(async (raw) => {
            const ctx = raw as unknown as Ctx;
            const data = ctx.context.newSession;
            if (!data?.user.twoFactorEnabled) return;
            // Same shape as the two-factor plugin's password hook: no session until the second step.
            deleteSessionCookie(raw as never, true);
            await ctx.context.internalAdapter.deleteSession(data.session.token);
            ctx.context.setNewSession(null);
            const cookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE, { maxAge: CHALLENGE_MAX_AGE_S });
            const identifier = `2fa-${generateRandomString(20)}`;
            const expiresAt = new Date(Date.now() + CHALLENGE_MAX_AGE_S * 1000);
            await ctx.context.internalAdapter.createVerificationValue({ value: data.user.id, identifier, expiresAt });
            await ctx.context.internalAdapter.createVerificationValue({ value: "0", identifier: `2fa-attempts-${identifier}`, expiresAt });
            await ctx.setSignedCookie(cookie.name, identifier, ctx.context.secret, cookie.attributes);
            throw ctx.redirect(page);
          }),
        },
      ],
    },
    endpoints: {
      routSecondFactorOptions: createAuthEndpoint("/two-factor/options", { method: "GET" }, async (raw) => {
        const ctx = raw as unknown as Ctx;
        let authUserId: string | null = null;
        let pending = false;
        const cookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE);
        const identifier = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
        if (identifier) {
          const v = await ctx.context.internalAdapter.findVerificationValue(identifier);
          if (v && new Date(v.expiresAt).getTime() > Date.now()) {
            authUserId = v.value;
            pending = true;
          }
        }
        if (!authUserId) {
          const session = await getSessionFromCtx(raw as never).catch(() => null);
          authUserId = (session as { user?: { id?: string } } | null)?.user?.id ?? null;
        }
        if (!authUserId) throw new APIError("UNAUTHORIZED", { code: "NO_CHALLENGE", message: "Er loopt geen aanmelding." });
        const facts = await options.describe(authUserId);
        return ctx.json({ pending, methods: secondFactorMethods(facts), smsTo: facts.smsTo });
      }),
    },
  };
}
