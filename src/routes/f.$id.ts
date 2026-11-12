import { createFileRoute } from "@tanstack/react-router";

/** Short link for a QR-shared file: redirects to a 5-minute signed URL while valid. */
const ID_RE = /^[0-9a-f-]{36}$/;

const page = (title: string, text: string, status: number) =>
  new Response(
    `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} — ROUT</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b0c;color:#f4f4f5;font-family:system-ui,sans-serif}main{max-width:28rem;padding:2rem;text-align:center}p{color:#a1a1aa}a{color:#f4f4f5}</style></head><body><main><h1>${title}</h1><p>${text}</p><p><a href="/">rout.be</a></p></main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );

export const Route = createFileRoute("/f/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { guardRequest } = await import("@/lib/api-guard.server");
        const limited = guardRequest(request, "shared-file", 120, 60000);
        if (limited) return limited;
        if (!ID_RE.test(params.id)) return page("Niet gevonden", "Deze link bestaat niet.", 404);
        try {
          const { resolveSharedFile } = await import("@/lib/storage/shared-files.server");
          const result = await resolveSharedFile(params.id);
          if (!result) return page("Niet gevonden", "Deze link bestaat niet.", 404);
          if ("expired" in result) return page("Verlopen", "Dit gedeelde bestand is niet meer beschikbaar.", 410);
          return new Response(null, { status: 302, headers: { location: result.url, "cache-control": "no-store" } });
        } catch {
          return page("Even niet beschikbaar", "Probeer het later opnieuw.", 503);
        }
      },
    },
  },
});
