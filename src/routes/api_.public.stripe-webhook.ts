import { createFileRoute } from "@tanstack/react-router";
import { verifyStripeSignature } from "@/lib/webhook-replay";

export const Route = createFileRoute("/api_/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["STRIPE_WEBHOOK_SECRET"];
        if (!secret) return new Response("Webhook not configured", { status: 503 });

        const signature = request.headers.get("stripe-signature") ?? "";
        const body = await request.text();
        if (!verifyStripeSignature(body, signature, secret)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let event: { id?: string; type?: string };
        try {
          event = JSON.parse(body) as { id?: string; type?: string };
        } catch {
          console.error("[stripe-webhook] onleesbare payload", { bytes: body.length });
          return new Response("Malformed payload", { status: 400 });
        }

        const eventId = event.id ?? null;
        const kind = event.type ?? null;
        const { sql } = await import("@/lib/neon");

        // Idempotency: claim het event met één atomaire insert. Een tweede
        // levering van hetzelfde id doet niets meer zolang de eerste liep of
        // slaagde; alleen een eerder gefaalde poging wordt heropend.
        if (eventId) {
          try {
            const claimed = (await sql`
              insert into public.webhook_events (id, source, kind, status, direction)
              values (${eventId}, 'stripe', ${kind}, 'processing', 'inbound')
              on conflict (id) do update
                 set status = 'processing',
                     attempts = public.webhook_events.attempts + 1,
                     error = null,
                     updated_at = now()
               where public.webhook_events.status = 'failed'
              returning id, attempts
            `) as { id: string; attempts: number }[];
            if (claimed.length === 0) {
              console.info("[stripe-webhook] duplicaat overgeslagen", { eventId, kind });
              return new Response("duplicate", { status: 200 });
            }
          } catch (err) {
            // Kan de claim niet weggeschreven worden, dan liever een 500 zodat
            // Stripe opnieuw levert dan het event stil laten vallen.
            console.error("[stripe-webhook] claim mislukt", {
              eventId,
              kind,
              error: err instanceof Error ? err.message : String(err),
            });
            return new Response("Idempotency store unavailable", { status: 500 });
          }
        }

        const { applyStripeEvent } = await import("@/lib/stripe-events.server");
        try {
          const result = await applyStripeEvent(event);
          if (eventId) {
            await sql`
              update public.webhook_events
                 set status = 'done', result = ${result ?? null}, http_status = 200, direction = 'inbound',
                     completed_at = now(), updated_at = now()
               where id = ${eventId}
            `;
          }
          console.info("[stripe-webhook] verwerkt", { eventId, kind, result });
          return new Response(result, { status: 200 });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[stripe-webhook] verwerking mislukt", {
            eventId,
            kind,
            error: message,
            stack: err instanceof Error ? err.stack : undefined,
          });
          if (eventId) {
            await sql`
              update public.webhook_events
                 set status = 'failed', error = ${message.slice(0, 500)}, http_status = 500, direction = 'inbound', updated_at = now()
               where id = ${eventId}
            `.catch(() => undefined);
          }
          // 500 laat Stripe opnieuw leveren; de claim staat op 'failed' en mag heropend worden.
          return new Response("Processing failed", { status: 500 });
        }
      },
    },
  },
});
