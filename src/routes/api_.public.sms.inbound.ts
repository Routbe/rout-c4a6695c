import { createFileRoute } from "@tanstack/react-router";

/**
 * sms-gate.app webhook (event `sms:received`). Protected by a shared token in
 * the URL query (`?token=`) that must equal SMS_INBOUND_TOKEN.
 */
export const Route = createFileRoute("/api_/public/sms/inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["SMS_INBOUND_TOKEN"]?.trim();
        const token = new URL(request.url).searchParams.get("token") ?? "";
        if (!expected || token.length !== expected.length || token !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        const body = (await request.json().catch(() => null)) as
          | { event?: string; payload?: { message?: string; phoneNumber?: string; sender?: string } }
          | null;
        const p = body?.payload;
        const from = (p?.phoneNumber ?? p?.sender ?? "").replace(/[^\d+]/g, "");
        if (body?.event !== "sms:received" || !from || !p?.message) return Response.json({ ok: true, ignored: true });
        const { confirmInboundCode } = await import("@/lib/phone/phone-otp.server");
        const verified = await confirmInboundCode(from.startsWith("+") ? from : `+${from}`, p.message);
        return Response.json({ ok: true, verified });
      },
    },
  },
});
