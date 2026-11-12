import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Public lookup for the /connect intro: only the display name and logo of an
 * active "Login met ROUT" app — the same facts the consent screen shows.
 */
export const getConnectClient = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.strictObject({ clientId: z.string().trim().min(1).max(200) }).parse(input))
  .handler(async ({ data }) => {
    try {
      const { sql } = await import("@/lib/neon");
      const rows = (await sql`
        select name, logo_url from public.oauth_clients where client_id = ${data.clientId} and status = 'active' limit 1
      `) as Record<string, unknown>[];
      const row = rows[0];
      if (!row) return null;
      return {
        name: typeof row["name"] === "string" ? row["name"] : null,
        logoUrl: typeof row["logo_url"] === "string" && /^https:\/\//.test(row["logo_url"]) ? row["logo_url"] : null,
      };
    } catch (error) {
      console.warn("[connect:client]", (error as Error)?.message);
      return null;
    }
  });
