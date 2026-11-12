import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * GET /api/public/card-check?h=<handle>&c=<6 digits>
 *
 * For partners (pool, transit, events) that scan the front QR of a ROUT Card
 * (rout.be/<handle>/<code>): answers only whether the code is fresh (≤ 10 min)
 * and the card is not frozen. Never returns ids, names, serials or any other data.
 */
const Query = z.object({
  h: z.string().trim().min(1).max(100).regex(/^@?[\w.-]+$/),
  c: z.string().regex(/^\d{6}$/),
});

const HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "x-content-type-options": "nosniff",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

export const Route = createFileRoute("/api_/public/card-check")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: HEADERS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = Query.safeParse({ h: url.searchParams.get("h") ?? "", c: url.searchParams.get("c") ?? "" });
        if (!parsed.success) return json({ fresh: false, reason: "invalid" }, 400);
        const { hitRateLimit, clientIp } = await import("@/lib/rate-limit-db.server");
        const limit = await hitRateLimit("card-front-check", clientIp(request), { limit: 60, windowSec: 60 }, { failClosed: true });
        if (!limit.ok) return json({ fresh: false, reason: "limited" }, 429);
        // Per card as well: many IPs together must not be able to guess one member's code.
        const cardLimit = await hitRateLimit("card-front-check-card", parsed.data.h.replace(/^@/, "").toLowerCase(), { limit: 120, windowSec: 600 }, { failClosed: true });
        if (!cardLimit.ok) return json({ fresh: false, reason: "limited" }, 429);
        try {
          const { generateWalletPayload } = await import("@/lib/wallet/wallet-payload.server");
          const card = await generateWalletPayload(parsed.data.h.replace(/^@/, ""), { space: "root" });
          if (!card) return json({ fresh: false });
          const { cardStatus } = await import("@/lib/wallet/card-freeze.server");
          if ((await cardStatus(card.serial)) !== "active") return json({ fresh: false });
          const { livenessKey } = await import("@/lib/wallet/card-liveness.server");
          const { isFreshFrontCode } = await import("@/lib/wallet/card-front-code");
          return json({ fresh: await isFreshFrontCode(await livenessKey(), card.serial, parsed.data.c, Date.now()) });
        } catch {
          return json({ fresh: false, reason: "unavailable" }, 503);
        }
      },
    },
  },
});
