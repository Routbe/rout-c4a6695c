import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

/**
 * Profile photo upload.
 *
 * Primary: Scaleway client bucket (`users/<uid>/avatar/…`, public-read) and the
 * full public URL is returned. Fallback when storage is not configured: the
 * legacy Neon blob table, streamed by `/api/public/avatar`.
 */
const schema = z
  .object({
    base64: z.string().min(16).max(7_200_000),
    contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
    ext: z.string().max(5).optional(),
    /** Workspace logos live apart from the member's avatar history (never pruned with it). */
    purpose: z.enum(["avatar", "workspace-logo"]).optional(),
  })
  .strict();

export const uploadAvatar = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(
    async ({ data, context }): Promise<{ ok: boolean; path?: string; url?: string; message?: string }> => {
      const s = await import("@/lib/storage/s3.server");
      const bytes = s.base64ToBytes(data.base64);
      if (bytes.byteLength > s.MAX_UPLOAD_BYTES) return { ok: false, message: "Keep the image under 5 MB." };
      const real = s.sniffType(bytes);
      if (!real || !(s.IMAGE_TYPES as readonly string[]).includes(real)) {
        return { ok: false, message: "Use a JPG, PNG, WebP or GIF image." };
      }

      if (s.storageConfigured("client")) {
        const folder = data.purpose === "workspace-logo" ? "workspace-logo" : "avatar";
        const key = `users/${context.userId}/${folder}/${Date.now()}.${s.extFor(real)}`;
        try {
          await s.putObject("client", key, bytes, { contentType: real, publicRead: true });
          return { ok: true, url: s.publicUrl("client", key) };
        } catch (error) {
          console.error("[avatar] Scaleway upload failed, falling back to Neon", error);
        }
      }

      const { sql } = await import("@/lib/neon");
      const prefix = data.purpose === "workspace-logo" ? "workspace-logo" : "avatar";
      const path = `${context.userId}/${prefix}-${Date.now()}.${s.extFor(real)}`;
      await sql.query(
        `insert into public.avatar_objects (path, user_id, content_type, data)
         values ($1, $2, $3, $4)
         on conflict (path) do update set content_type = excluded.content_type, data = excluded.data`,
        [path, context.userId, real, data.base64],
      );
      await sql.query(
        `delete from public.avatar_objects
         where user_id = $1 and path like $2
           and path not in (
             select path from public.avatar_objects where user_id = $1 and path like $2
             order by created_at desc limit 3
           )`,
        [context.userId, `${context.userId}/${prefix}-%`],
      );
      return { ok: true, path, url: `/api/public/avatar?path=${encodeURIComponent(path)}` };
    },
  );
