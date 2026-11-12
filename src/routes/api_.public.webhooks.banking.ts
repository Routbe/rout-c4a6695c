/**
 * Banking webhook (bunq / Wise / any bank that can POST JSON).
 *
 * Receives an inbound payment notification, extracts the `ROUT-XXXX`
 * reference plus the amount and hands it to the shared SEPA matcher, which
 * flips the payment from `pending` to `paid` and activates the account on a
 * perfect match.
 *
 * Auth: a shared secret in `Authorization: Bearer <BANKING_WEBHOOK_SECRET>`
 * (or the `x-webhook-secret` header). Optionally, when
 * `BANKING_WEBHOOK_HMAC_SECRET` is set, an `x-signature` HMAC-SHA256 hex
 * digest over the raw body is required as well.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { createFileRoute } from "@tanstack/react-router";

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Flattens the provider payload into the free text the matcher understands. */
function toMatchText(payload: unknown, raw: string): string {
  const parts: string[] = [];
  const visit = (value: unknown, depth = 0) => {
    if (depth > 4 || value == null) return;
    if (typeof value === "string" || typeof value === "number") {
      parts.push(String(value));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (typeof value === "object") {
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (typeof item === "number" && /amount|value/i.test(key)) {
          // Bank APIs send amounts as majors ("12.99") or minors (1299).
          parts.push(
            Number.isInteger(item) && Math.abs(item) > 999
              ? `EUR ${(item / 100).toFixed(2)}`
              : `EUR ${item.toFixed(2)}`,
          );
          continue;
        }
        if (typeof item === "string" && /amount|value/i.test(key) && /^[0-9.,]+$/.test(item)) {
          parts.push(`EUR ${item}`);
          continue;
        }
        visit(item, depth + 1);
      }
    }
  };
  visit(payload);
  const text = parts.join(" ");
  return text.trim().length > 0 ? text : raw;
}

export const Route = createFileRoute("/api_/public/webhooks/banking")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["BANKING_WEBHOOK_SECRET"];
        // A short/blank secret is treated as "not configured": never accept
        // an unauthenticated write path into payment activation.
        if (!secret || secret.trim().length < 16) {
          console.error("[banking-webhook] refused: BANKING_WEBHOOK_SECRET missing or too short");
          return new Response("Webhook not configured", { status: 503 });
        }

        const bearer = (request.headers.get("authorization") ?? "")
          .replace(/^Bearer\s+/i, "")
          .trim();
        const headerSecret = (request.headers.get("x-webhook-secret") ?? "").trim();
        const presented = bearer || headerSecret;
        if (!presented || !safeEqual(presented, secret)) {
          console.warn("[banking-webhook] unauthorized request rejected");
          return new Response("Unauthorized", { status: 401 });
        }

        const raw = await request.text();
        if (raw.length > 100_000) return new Response("Payload too large", { status: 413 });

        const hmacSecret = process.env["BANKING_WEBHOOK_HMAC_SECRET"];
        if (hmacSecret) {
          const signature = (request.headers.get("x-signature") ?? "").trim();
          const digest = createHmac("sha256", hmacSecret).update(raw).digest("hex");
          if (!signature || !safeEqual(signature.toLowerCase(), digest)) {
            return new Response("Invalid signature", { status: 401 });
          }
        }

        let payload: unknown = null;
        try {
          payload = JSON.parse(raw);
        } catch {
          payload = null;
        }

        const text = toMatchText(payload, raw);
        try {
          const { matchInboundPayment } = await import("@/lib/sepa-matching.server");
          const outcome = await matchInboundPayment(text);
          return Response.json({
            ok: true,
            level: outcome.level,
            reference: outcome.reference,
            activated: outcome.activated ?? false,
            reason: outcome.reason,
          });
        } catch (error) {
          console.error("[banking-webhook] matching failed", error);
          return new Response("Matching failed", { status: 500 });
        }
      },

      GET: async () => Response.json({ ok: true, endpoint: "banking-webhook" }),
    },
  },
});
