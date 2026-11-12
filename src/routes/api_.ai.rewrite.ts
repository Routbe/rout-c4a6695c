import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Ghost Mode "magic wand": rewrites a draft anonymous message so the writing
 * style no longer gives the sender away. ROUT stores nothing and logs no text;
 * the draft (without account, cookie or IP) is processed by the configured
 * sovereign provider under its own terms. The browser puts the answer back in
 * the textarea and the sender decides to send.
 * Same-site only, max 3 rewrites per minute (20 per hour) per IP.
 */
const Body = z.object({ text: z.string().max(600), ui_language: z.enum(["nl", "en", "fr", "de"]).optional().catch(undefined) });

export const Route = createFileRoute("/api_/ai/rewrite")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const noStore = { "cache-control": "no-store" };
        if (request.headers.get("sec-fetch-site") === "cross-site") {
          return Response.json({ error: "forbidden" }, { status: 403, headers: noStore });
        }
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400, headers: noStore });

        const { QUESTION_MAX, normalizeText } = await import("@/lib/questions-rules");
        const text = normalizeText(parsed.data.text, QUESTION_MAX);
        if (!text) return Response.json({ error: "invalid" }, { status: 400, headers: noStore });

        const { REWRITE_RATE, REWRITE_RATE_HOURLY } = await import("@/lib/qa/style-mask");
        const { clientIp, hitRateLimit } = await import("@/lib/rate-limit-db.server");
        const { tooManyRequests } = await import("@/lib/rate-limit-rules");
        const ip = clientIp(request);
        const minute = await hitRateLimit("qa-rewrite", ip, REWRITE_RATE, { failClosed: true });
        const hour = minute.ok ? await hitRateLimit("qa-rewrite-hour", ip, REWRITE_RATE_HOURLY, { failClosed: true }) : minute;
        if (!minute.ok || !hour.ok) return tooManyRequests(Math.max(minute.retryAfter, hour.retryAfter));

        const { maskWritingStyle } = await import("@/lib/qa/style-mask.server");
        const result = await maskWritingStyle(text, parsed.data.ui_language);
        if (!result.text) return Response.json({ error: "invalid" }, { status: 400, headers: noStore });
        return Response.json(result, { headers: noStore });
      },
    },
  },
});
