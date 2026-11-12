import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";
import type { ReachSettings } from "@/lib/total-reach";

/** RPC-laag voor het totale-bereik-paneel in de Studio. */

export const getReachSettings = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { readReachSettings } = await import("./total-reach.server");
    return (await readReachSettings(context.userId)) as ReachSettings;
  });

export const updateReachSettings = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        showTotalReach: z.boolean().optional(),
        accounts: z
          .array(
            z.object({
              provider: z.string().regex(/^[a-z0-9_]{2,32}$/),
              includeInReach: z.boolean().optional(),
              manualCount: z.number().int().min(0).max(2_000_000_000).nullable().optional(),
            }),
          )
          .max(60)
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { saveReachSettings } = await import("./total-reach.server");
    return (await saveReachSettings(context.userId, data)) as ReachSettings;
  });

export const syncFollowersNow = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { syncFollowersForProfile } = await import("./total-reach.server");
    return (await syncFollowersForProfile(context.userId)) as ReachSettings;
  });
