import { createFileRoute } from "@tanstack/react-router";

/**
 * Live betaalstatus van een bunq.me-tab.
 *
 * De checkout pollt dit endpoint elke 3 seconden. Zodra bunq `PAID` meldt
 * activeert de server de verificatie (profiel, badges, bevestigingsmail) via
 * dezelfde canonieke `activateVerification()` als de bankwebhook — dubbel
 * activeren is onmogelijk omdat die functie idempotent is.
 *
 * Alleen de eigenaar van de betaling mag de status opvragen.
 */
export const Route = createFileRoute("/api_/bunq/check-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { guardRequest } = await import("@/lib/api-guard.server");
        const limited = guardRequest(request, "bunq-status", 120, 60000);
        if (limited) return limited;

        const url = new URL(request.url);
        const tabId = Number(url.searchParams.get("tab_id"));
        const accountId = Number(url.searchParams.get("account_id"));
        const paymentId = url.searchParams.get("payment_id") ?? "";

        if (
          !Number.isFinite(tabId) ||
          tabId <= 0 ||
          !Number.isFinite(accountId) ||
          accountId <= 0
        ) {
          return Response.json({ error: "invalid_tab" }, { status: 400 });
        }
        if (!/^[0-9a-f-]{36}$/i.test(paymentId)) {
          return Response.json({ error: "invalid_payment" }, { status: 400 });
        }

        const { currentUser } = await import("@/lib/auth/session.server");
        const user = await currentUser().catch(() => null);
        if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

        const { sql } = await import("@/lib/neon");
        const rows = (await sql`
          select id, user_id, status, provider, provider_ref
            from public.verification_payments
           where id = ${paymentId} limit 1
        `) as { id: string; user_id: string; status: string; provider: string | null; provider_ref: string | null }[];
        const payment = rows[0];
        if (!payment || payment.user_id !== user.id) {
          return Response.json({ error: "not_found" }, { status: 404 });
        }

        // Al afgerond (bijv. door de bankwebhook): stop het pollen direct.
        if (payment.status === "paid") {
          return Response.json({ status: "PAID", activated: true, done: true });
        }

        // The bank tab must be the exact one the server created for THIS payment
        // (stored as provider_ref when the checkout started, with the payment's
        // own amount). Client-supplied account/tab ids are only accepted when
        // they match it, so another paid tab can never activate this payment.
        if (
          payment.status !== "paid" &&
          (payment.provider !== "bunq" || payment.provider_ref !== `bunqme:${accountId}:${tabId}`)
        ) {
          return Response.json({ error: "not_found" }, { status: 404 });
        }

        try {
          const { readBunqMeTabStatus } = await import("@/lib/bunq.server");
          const tab = await readBunqMeTabStatus(accountId, tabId);
          if (tab.paid) {
            const { activateVerification } = await import("@/lib/verification.server");
            const activated = await activateVerification(
              payment.id,
              `bunqme_tab:${accountId}:${tabId}`,
            );
            return Response.json({ status: "PAID", activated, done: true });
          }
          return Response.json({ status: tab.status, activated: false, done: false });
        } catch (error) {
          console.error("[bunq:check-status]", error);
          return Response.json(
            { status: "UNKNOWN", activated: false, done: false },
            { status: 502 },
          );
        }
      },
    },
  },
});
