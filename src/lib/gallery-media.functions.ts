import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";

import { GALLERY_ALLOWED_TYPES, GALLERY_MAX_BYTES } from "@/lib/gallery";

/**
 * Galerij-uploads op onze eigen infrastructuur.
 *
 * De Neon-stack heeft geen object store: een foto wordt als base64-blob in
 * `public.gallery_objects` (Frankfurt) bewaard en teruggestreamd door
 * `/api/public/gallery-media`. Bestanden zijn gelimiteerd tot 10 MB en staan
 * altijd onder het eigen gebruikers-id.
 */
export const uploadGalleryMedia = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { base64: string; contentType: string; ext: string }) => input)
  .handler(async ({ data, context }): Promise<{ ok: boolean; url?: string; message?: string }> => {
    if (!GALLERY_ALLOWED_TYPES.includes(data.contentType)) {
      return { ok: false, message: "Gebruik een JPG, PNG, WebP, GIF of SVG." };
    }
    const bytes = Math.floor((data.base64.length * 3) / 4);
    if (bytes > GALLERY_MAX_BYTES) return { ok: false, message: "Houd de foto onder 10 MB." };

    const { sql } = await import("@/lib/neon");
    // Free storage: uploaded gallery photos are capped per member; image links never count.
    const { LIFETIME_MAX_FILES } = await import("@/lib/asset-retention");
    const used = (await sql`select count(*)::int as n from public.gallery_objects where user_id = ${context.userId}`) as { n: number }[];
    if (Number(used[0]?.n ?? 0) >= LIFETIME_MAX_FILES) {
      return { ok: false, message: `Je gebruikt al ${LIFETIME_MAX_FILES} gratis foto's. Verwijder er een of voeg een afbeeldingslink toe.` };
    }
    const ext =
      (data.ext || "jpg")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 5) || "jpg";
    const path = `${context.userId}/gallery-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;
    await sql.query(
      `insert into public.gallery_objects (path, user_id, content_type, data)
       values ($1, $2, $3, $4)
       on conflict (path) do update set content_type = excluded.content_type, data = excluded.data`,
      [path, context.userId, data.contentType, data.base64],
    );
    return { ok: true, url: `/api/public/gallery-media?path=${encodeURIComponent(path)}` };
  });
