import { createFileRoute } from "@tanstack/react-router";

/**
 * Publieke galerij-mediaproxy.
 *
 * Foto's staan in `public.gallery_objects` op Neon (Frankfurt). Een galerijblok
 * bewaart `/api/public/gallery-media?path=<uid>/<file>` en deze route streamt
 * de bytes terug. De padvorm wordt gevalideerd, dus enkel galerijrijen zijn
 * bereikbaar.
 */
const PATH_RE = /^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,160}$/;

export const Route = createFileRoute("/api_/public/gallery-media")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { guardRequest } = await import("@/lib/api-guard.server");
        const limited = guardRequest(request, "gallery-media", 480, 60000);
        if (limited) return limited;

        const path = new URL(request.url).searchParams.get("path") ?? "";
        if (!PATH_RE.test(path)) return new Response("Invalid path", { status: 400 });

        try {
          const { sql, withDbContext } = await import("@/lib/neon");
          if (path.split("/")[1]?.startsWith("omni-")) {
            const { currentUser } = await import("@/lib/auth/session.server");
            const user = await currentUser();
            const rows = await withDbContext({ userId: user?.id ?? null, workspaceId: null }, () =>
              sql.query("select * from public.rout_omni_media($1,$2::uuid)", [path, user?.id ?? null]),
            ) as { object_key: string; content_type: string }[];
            const media = rows[0];
            if (!media) return new Response("Not found", { status: 404 });
            const { getObject } = await import("@/lib/storage/s3.server");
            const object = await getObject("client", media.object_key);
            if (!object.ok) return new Response("Not found", { status: 404 });
            return new Response(object.body, { headers: {
              "content-type": media.content_type, "cache-control": "private, no-store",
              "x-content-type-options": "nosniff",
            } });
          }
          const rows = (await sql.query(
            `select content_type, data from public.gallery_objects where path = $1`,
            [path],
          )) as { content_type: string; data: string }[];
          const row = rows[0];
          if (!row) return new Response("Not found", { status: 404 });

          const binary = Buffer.from(row.data, "base64");
          return new Response(binary, {
            headers: {
              "content-type": row.content_type || "image/jpeg",
              "cache-control": "public, max-age=86400, immutable",
            },
          });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },
    },
  },
});
