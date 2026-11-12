import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";

/** All linked identities (proofs only: signing in is passkey-only). */
export const getMyIdentities = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { listIdentities } = await import("./identities.server");
    return { identities: await listIdentities(context.userId), email: context.user?.email ?? null };
  });

/** Removes a linked identity. */
export const unlinkMyIdentity = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { identityId: string }) => {
    if (!input?.identityId) throw new Error("identity_required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { unlinkIdentity } = await import("./identities.server");
    return unlinkIdentity(context.userId, data.identityId);
  });
