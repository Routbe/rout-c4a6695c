import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { AppCredential } from "./app-credentials";
export const getPublicAppCredentials = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ handle: z.string().regex(/^[a-z0-9._-]{1,63}$/) }).parse(data))
  .handler(async ({ data }): Promise<AppCredential[]> => {
    const { runQuery } = await import("./neon");
    try {
      const result = await runQuery("select * from public.public_app_credentials($1)", [data.handle]);
      return result.rows.map(r => ({ id: String(r["id"]), clientId: String(r["client_id"]), type: r["type"] as AppCredential["type"], title: String(r["title"]), description: r["description"] as string | null, imageUrl: r["image_url"] as string | null, issuedAt: String(r["issued_at"]), showOnName: r["show_on_name"] === true, appName: String(r["app_name"]), issuerHandle: r["issuer_handle"] as string | null }));
    } catch (error) { console.warn("[credentials] public projection unavailable", (error as Error).message); return []; }
  });