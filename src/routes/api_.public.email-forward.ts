import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Brevo Inbound Parsing webhook for the private relay (priv-…@mail.rout.be).
 * Protected by `?token=` that must equal EMAIL_INBOUND_TOKEN. After auth it
 * always answers 200 so Brevo does not retry rejected mail forever.
 */
const Addr = z.object({ Address: z.string().max(320), Name: z.string().max(200).nullish() });
const Item = z.object({
  MessageId: z.string().max(998).nullish(),
  From: Addr,
  To: z.array(Addr).max(50).nullish(),
  Recipients: z.array(z.string().max(320)).max(50).nullish(),
  Subject: z.string().max(2000).nullish(),
  RawHtmlBody: z.string().nullish(),
  RawTextBody: z.string().nullish(),
});
const Body = z.object({ items: z.array(Item).min(1).max(20) });

function sameToken(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api_/public/email-forward")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["EMAIL_INBOUND_TOKEN"]?.trim() ?? "";
        const token = new URL(request.url).searchParams.get("token") ?? "";
        if (!expected || !sameToken(token, expected)) return new Response("Unauthorized", { status: 401 });
        const raw = await request.text();
        if (raw.length > 12 * 1024 * 1024) return Response.json({ ok: true, ignored: "too_large" });
        let parsed: z.infer<typeof Body>;
        try {
          parsed = Body.parse(JSON.parse(raw));
        } catch {
          return Response.json({ ok: true, ignored: "invalid_payload" });
        }
        const { deliverInbound } = await import("@/lib/oauth/email-forwarding.server");
        const results: import("@/lib/oauth/email-forwarding.server").InboundResult[] = [];
        for (const it of parsed.items) {
          const html = it.RawHtmlBody ?? null;
          const text = it.RawTextBody ?? null;
          results.push(
            ...(await deliverInbound({
              messageId: it.MessageId ?? null,
              from: it.From.Address,
              fromName: it.From.Name ?? null,
              to: [...(it.To ?? []).map((t) => t.Address), ...(it.Recipients ?? [])],
              subject: it.Subject ?? "",
              html,
              text,
              sizeBytes: new TextEncoder().encode((html ?? "") + (text ?? "")).length,
            })),
          );
        }
        // Counts only: no addresses or content in the response.
        const count = (s: string) => results.filter((r) => r.status === s).length;
        return Response.json({ ok: true, forwarded: count("forwarded"), rejected: count("rejected"), failed: count("failed") });
      },
    },
  },
});
