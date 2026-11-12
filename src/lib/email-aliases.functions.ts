import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";
import { APP_DOMAINS } from "./app-domains";

/** Alias selection + routing status for the signed-in member. */
export const getMyEmailAliases = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { readAliasState } = await import("./email-aliases.server");
    return readAliasState(context.userId);
  });

/** Picks which domains forward mail to the member's confirmed inbox. */
export const setMyEmailAliases = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z.object({ domains: z.array(z.enum(APP_DOMAINS)).max(APP_DOMAINS.length) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { saveAliasDomains } = await import("./email-aliases.server");
    return saveAliasDomains(context.userId, data.domains);
  });
