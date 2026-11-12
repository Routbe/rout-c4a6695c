import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

/** The signed-in member's current handle, if any. */
export const getMyHandle = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { readMyHandle } = await import("./claim.server");
    return readMyHandle(context.userId);
  });

/**
 * Verified members: name-based handle options with live availability, widened
 * server-side until enough options are free. Requires auth so this can never
 * be used to enumerate other members' names or handles.
 */
export const getVerifiedHandleOptions = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { getVerifiedHandleOptionsFor } = await import("./claim.server");
    return getVerifiedHandleOptionsFor(context.userId);
  });

/** Claims a free handle for the signed-in member. */
export const claimHandle = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        handle: z.string().max(200),
        altcha: z.string().max(4000).optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    // Botbescherming: handles zijn schaars, dus reserveren vereist een mens.
    const { assertHuman } = await import("./altcha.server");
    await assertHuman(data.altcha ?? null);
    const { claimHandleFor } = await import("./claim.server");
    return claimHandleFor(context.userId, data.handle, context.db);
  });
