import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/public/oauth/picture?c=<client_id>&t=<sealed token>
 * Profile photo for an app that received the `picture` claim. Only works while the
 * member's consent for that app is active; the URL never contains the account id.
 */
export const Route = createFileRoute("/api_/public/oauth/picture")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { guardRequest } = await import("@/lib/api-guard.server");
        const limited = guardRequest(request, "oauth-picture", 240, 60000);
        if (limited) return limited;
        const params = new URL(request.url).searchParams;
        const { openAppPicture } = await import("@/lib/oauth/picture-proxy.server");
        const target = await openAppPicture(params.get("c") ?? "", params.get("t") ?? "");
        const notFound = () => new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
        if (!target) return notFound();
        try {
          const { sql } = await import("@/lib/neon");
          const clientId = params.get("c")!;
          const rows = (await sql`
            select o.content_type, o.data
              from public.avatar_objects o
             where o.path = ${target.path}
               and exists (select 1 from public.oauth_consents g join public.oauth_clients c on c.client_id = g.client_id
                            where g.user_id = ${target.userId} and g.client_id = ${clientId}
                              and g.revoked_at is null and c.status = 'active')
             limit 1`) as { content_type: string; data: string }[];
          const row = rows[0];
          if (!row) return notFound();
          return new Response(Buffer.from(row.data, "base64"), {
            headers: {
              "content-type": row.content_type || "image/jpeg",
              // Short cache: a revoked consent must stop serving quickly.
              "cache-control": "private, max-age=300",
              "x-content-type-options": "nosniff",
            },
          });
        } catch {
          return notFound();
        }
      },
    },
  },
});
