import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

function validateBootstrapToken(data: unknown): { token: string } {
  return z.strictObject({ token: z.string().trim().min(16).max(512) }).parse(data);
}

/**
 * Development bootstrap probe: reports whether the platform still has no
 * administrator. Returns a single boolean and no PII, so it is safe to call
 * from the public sign-in screen.
 */
export const getBootstrapState = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { hasBootstrapAdmin } = await import("./auth/owner-admin.server");
    const hasAdmin = await hasBootstrapAdmin();
    return { needsFirstAdmin: !hasAdmin };
  } catch {
    return { needsFirstAdmin: false };
  }
});

/** Claims the first admin role with the server-configured, single-use token. */
export const claimFirstAdmin = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(validateBootstrapToken)
  .handler(async ({ data, context }) => {
    const { claimBootstrapAdmin } = await import("./auth/owner-admin.server");
    const ok = await claimBootstrapAdmin(context.userId, data.token);
    return { ok };
  });

/**
 * Public handle availability probe used by the onboarding form.
 * The client debounces (400 ms); this adds a coarse server-side throttle so a
 * scripted caller cannot turn the field into a username enumeration firehose.
 */
export const checkHandleAvailability = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ handle: z.string().max(200) }).parse(data))
  .handler(async ({ data }) => {
    const { isHandleFree, normalizeHandle, throttle } = await import("./onboarding.server");

    const normalized = normalizeHandle(data.handle);
    if (!throttle(normalized)) {
      return { ok: false as const, normalized, reason: "Too many checks — slow down a moment." };
    }
    return isHandleFree(normalized);
  });

/** Turns a full legal name into a free, suggested handle. */
export const suggestHandleForName = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ fullName: z.string().max(200) }).parse(data))
  .handler(async ({ data }) => {
    const { suggestFreeHandle } = await import("./onboarding.server");
    return { handle: await suggestFreeHandle(data.fullName) };
  });

/*
 * NOTE: the former `createTestSuperAdmin` shortcut was removed on purpose.
 * It was an unauthenticated server function that minted a confirmed account
 * with a fixed password and granted it the `admin` role, guarded only by
 * `NODE_ENV`. Admin access is granted exclusively through `user_roles`.
 */

/**
 * Registration suggestion: takes the part before the `@` of an e-mail address
 * and returns free handle variants with a 2-digit discriminator
 * (e.g. `jona.delplanche48`). Availability is checked against the database, so
 * the UI can never offer a handle that is already claimed.
 */
export const suggestHandlesFromEmailAddress = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ email: z.string().max(320) }).parse(data))
  .handler(async ({ data }) => {
    const { suggestHandlesFromEmail } = await import("./onboarding.server");
    return { handles: await suggestHandlesFromEmail(data.email) };
  });
