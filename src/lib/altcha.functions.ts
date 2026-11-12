import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Public: hands out a fresh signed ALTCHA challenge (harder after repeated failed sign-ins). */
export const getAltchaChallenge = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ identityHash: z.string().min(16).max(128).optional().nullable() }).parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    try {
      const { createAltchaChallenge, identityNeedsHardChallenge } = await import("./altcha.server");
      const hard = await identityNeedsHardChallenge(data.identityHash);
      return { ...(await createAltchaChallenge({ hard })), hard };
    } catch (err) {
      // Surface the exact cause in the server logs instead of a bare 500.
      console.error("[ALTCHA Error]: challenge generation failed:", err);
      throw err;
    }
  });
