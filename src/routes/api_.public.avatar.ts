import { createFileRoute } from "@tanstack/react-router";

/**
 * Public avatar proxy.
 *
 * Avatars live in `public.avatar_objects` on Neon (Frankfurt). A profile stores
 * `/api/public/avatar?path=<uid>/<file>` and this route streams the bytes back.
 * The path shape is validated, so only avatar rows are reachable. Public pages use
 * `?ref=<sealed path>` instead, because the path starts with the account id.
 */
const PATH_RE = /^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,120}$/;

export const Route = createFileRoute("/api_/public/avatar")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { guardRequest } = await import("@/lib/api-guard.server");
        const limited = guardRequest(request, "avatar", 240, 60000);
        if (limited) return limited;

        const params = new URL(request.url).searchParams;
        let path = params.get("path") ?? "";
        const ref = params.get("ref");
        if (ref) {
          // Sealed form used on public pages: the account-id path never reaches visitors.
          const { openText } = await import("@/lib/auth/public-ref.server");
          path = (await openText(ref, "avatar:public")) ?? "";
        }
        if (!PATH_RE.test(path)) return new Response("Invalid path", { status: 400 });

        try {
          const { sql } = await import("@/lib/neon");
          const rows = (await sql.query(
            `select content_type, data from public.avatar_objects where path = $1`,
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
