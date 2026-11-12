import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";
import { decodeGridWebp, GRID_UPLOAD_MAX_BYTES } from "@/lib/omni-upload";

/** Manual cover is compressed in the browser; webserver only validates/stores. */
export const uploadGridCover = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ base64: z.string().max(Math.ceil(GRID_UPLOAD_MAX_BYTES / 3) * 4) }).strict().parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; url?: string; message?: string }> => {
    const bytes = decodeGridWebp(data.base64);
    if (!bytes) return { ok: false, message: "Gebruik een geldige WebP-afbeelding onder 5 MB." };
    const { sql } = await import("@/lib/neon");
    const { LIFETIME_MAX_FILES } = await import("@/lib/asset-retention");
    const counts = await sql`select ((select count(*) from public.gallery_objects where user_id=${context.userId}) +
      (select count(*) from public.omni_jobs where user_id=${context.userId} and status='ready'))::int as n`;
    if (Number(counts[0]?.n ?? 0) >= LIFETIME_MAX_FILES) return { ok: false, message: "Je bestandslimiet is bereikt." };
    const id = crypto.randomUUID();
    const path = `${context.userId}/omni-${id}-manual.webp`;
    const key = `users/${path}`;
    const { putObject, deleteObject } = await import("@/lib/storage/s3.server");
    try {
      await putObject("client", key, bytes, { contentType: "image/webp", cacheControl: "private, no-store" });
      try {
        await sql`insert into public.omni_jobs(id,user_id,source,source_url,status,content_type,title,local_media_path)
          values(${id},${context.userId},'studio','https://rout.be','ready','social','',${path})`;
      } catch {
        // Writes may have committed: preserve only when readback confirms it,
        // and leave objects intact on ambiguous readback for later reconciliation.
        const rows = await sql`select id from public.omni_jobs where id=${id} and user_id=${context.userId} limit 1`;
        if (!rows.length) { await deleteObject("client", key); return { ok: false, message: "Opslaan lukt momenteel niet." }; }
      }
      return { ok: true, url: `/api/public/gallery-media?path=${encodeURIComponent(path)}` };
    } catch { return { ok: false, message: "ROUT-opslag is momenteel niet beschikbaar." }; }
  });