import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";
import type { IdentityRelay } from "./identity-relays.server";

export type { IdentityRelay };

/** The signed-in member's identity relays (proxy → real address per app). */
export const listIdentityRelays = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<IdentityRelay[]> => {
    const { listRelays } = await import("./identity-relays.server");
    return listRelays(context.userId);
  });

/**
 * Pause or resume a relay. Queued by the local-first outbox, so it must be
 * idempotent: repeating the same status is a no-op.
 */
export const setIdentityRelayStatus = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) =>
    z.object({ relayId: z.string().uuid(), status: z.enum(["active", "paused"]) }).strict().parse(d),
  )
  .handler(async ({ data, context }) => {
    const { setRelayStatus } = await import("./identity-relays.server");
    const ok = await setRelayStatus(context.userId, data.relayId, data.status);
    if (!ok) throw new Error("Deze relay bestaat niet (meer).");
    return { ok: true as const };
  });
