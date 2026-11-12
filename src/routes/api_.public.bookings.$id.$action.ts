/**
 * Accept/decline-links uit de hostmail. Publiek bereikbaar, maar elke actie is
 * ondertekend met een HMAC-token dat alleen in die e-mail staat.
 */
import { createFileRoute } from "@tanstack/react-router";

function page(title: string, body: string, status: number): Response {
  return new Response(
    `<!doctype html><html lang="nl"><head><meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <title>${title} · ROUT</title></head>
     <body style="font-family:system-ui;margin:0;display:grid;place-items:center;min-height:100vh;background:#fafafa;color:#18181b">
       <main style="max-width:32rem;padding:2rem;text-align:center">
         <h1 style="font-size:1.25rem;margin:0 0 .5rem">${title}</h1>
         <p style="color:#52525b">${body}</p>
         <p><a href="https://rout.be" style="color:#0f172a">Terug naar ROUT</a></p>
       </main>
     </body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api_/public/bookings/$id/$action")({
  server: {
    handlers: {
      // GET only shows a confirm button: mail scanners that open links change nothing.
      GET: async ({ request, params }) => {
        const action =
          params.action === "accept" ? "accept" : params.action === "decline" ? "decline" : null;
        if (!action) return page("Onbekende actie", "Deze link is niet geldig.", 400);
        const token = new URL(request.url).searchParams.get("token") ?? "";
        const { verifyBookingToken } = await import("@/lib/booking.server");
        if (!verifyBookingToken(params.id, action, token)) {
          return page("Ongeldige link", "Deze bevestigingslink klopt niet of is verlopen.", 401);
        }
        const label = action === "accept" ? "Ja, afspraak aanvaarden" : "Ja, aanvraag weigeren";
        const safe = token.replace(/[^A-Za-z0-9._~-]/g, "");
        return page(
          action === "accept" ? "Afspraak aanvaarden?" : "Aanvraag weigeren?",
          `Er verandert pas iets als je bevestigt.</p><form method="post" action="?token=${safe}"><button type="submit" style="font:inherit;padding:.7rem 1.4rem;border:0;border-radius:.5rem;background:#0f172a;color:#fff;cursor:pointer">${label}</button></form><p>`,
          200,
        );
      },
      POST: async ({ request, params }) => {
        const action =
          params.action === "accept" ? "accept" : params.action === "decline" ? "decline" : null;
        if (!action) return page("Onbekende actie", "Deze link is niet geldig.", 400);

        const token = new URL(request.url).searchParams.get("token") ?? "";
        const { resolveBookingRequest, verifyBookingToken } = await import("@/lib/booking.server");
        if (!verifyBookingToken(params.id, action, token)) {
          return page("Ongeldige link", "Deze bevestigingslink klopt niet of is verlopen.", 401);
        }

        const result = await resolveBookingRequest(params.id, action);
        return page(
          result.ok
            ? action === "accept"
              ? "Afspraak aanvaard"
              : "Aanvraag geweigerd"
            : "Niets te doen",
          result.message,
          result.ok ? 200 : 409,
        );
      },
    },
  },
});
