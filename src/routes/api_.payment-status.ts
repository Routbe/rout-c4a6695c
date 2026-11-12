import { createFileRoute } from "@tanstack/react-router";

/**
 * Lichtgewicht betaalstatus voor de wachtschermen.
 *
 * `GET /api/payment-status?payment_id=<uuid>` doet precies één indexed read op
 * `public.verification_payments` en geeft alleen de status terug. Geen Stripe-
 * of bunq-call, geen afhandeling: dit endpoint is bewust goedkoop zodat de
 * frontend elke paar seconden mag pollen zonder de betaalproviders te raken.
 * Zonder `payment_id` wint de nieuwste betaling van de ingelogde gebruiker.
 *
 * Alleen de eigenaar van de betaling krijgt antwoord.
 */
const PAID_STATUSES = new Set(["paid", "succeeded", "success"]);

export const Route = createFileRoute("/api_/payment-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { guardRequest } = await import("@/lib/api-guard.server");
        const limited = guardRequest(request, "payment-status", 240, 60000);
        if (limited) return limited;

        const url = new URL(request.url);
        const paymentId = url.searchParams.get("payment_id");
        if (paymentId && !/^[0-9a-f-]{36}$/i.test(paymentId)) {
          return Response.json({ error: "invalid_payment" }, { status: 400 });
        }

        const { currentUser } = await import("@/lib/auth/session.server");
        const user = await currentUser().catch(() => null);
        if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

        const { sql } = await import("@/lib/neon");
        const rows = (await (paymentId
          ? sql`
              select id, status, updated_at, created_at
                from public.verification_payments
               where id = ${paymentId} and user_id = ${user.id}
               limit 1
            `
          : sql`
              select id, status, updated_at, created_at
                from public.verification_payments
               where user_id = ${user.id}
               order by created_at desc
               limit 1
            `)) as {
          id: string;
          status: string | null;
          updated_at: string | null;
          created_at: string | null;
        }[];

        const row = rows[0];
        if (!row) {
          return Response.json(
            { paymentId: null, status: null, at: null, paid: false },
            { headers: { "cache-control": "no-store" } },
          );
        }

        const status = String(row.status ?? "pending");
        return Response.json(
          {
            paymentId: row.id,
            status,
            at: row.updated_at ?? row.created_at,
            paid: PAID_STATUSES.has(status),
          },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
