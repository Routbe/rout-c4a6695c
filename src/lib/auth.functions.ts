import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

/**
 * Session lookup for the browser.
 *
 * Sign-in, sign-up, social login, password reset and sign-out all live in Neon
 * Auth (`/auth/sign-in`, `/auth/sign-up`, `/account/settings`). This module only
 * answers "who is signed in right now", bridged onto the existing
 * `public.users` record.
 */

export type AuthUser = {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user_metadata: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app_metadata: Record<string, any>;
  created_at: string;
  last_sign_in_at: string | null;
};

type UpdateAuthUserInput = { metadata?: { display_name?: string } };

function validateUpdateAuthUser(input: unknown): UpdateAuthUserInput {
  return z
    .strictObject({
      metadata: z
        .strictObject({ display_name: z.string().trim().max(120).optional() })
        .optional(),
    })
    .parse(input);
}

export const getSessionUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<AuthUser | null> => {
    const { currentUser } = await import("@/lib/auth/session.server");
    const { toAuthUser } = await import("@/lib/auth/serialize.server");
    const user = await currentUser();
    return user ? toAuthUser(user) : null;
  },
);

/** Profile metadata only — credentials are managed in Neon Auth. */
export const updateAuthUser = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(validateUpdateAuthUser)
  .handler(async ({ data, context }): Promise<{ ok: boolean; message?: string }> => {
    if (data.metadata) {
      const { updateUserMetadata } = await import("@/lib/auth/users.server");
      await updateUserMetadata(context.userId, data.metadata);
    }
    return { ok: true };
  });
