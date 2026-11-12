import { createFileRoute } from "@tanstack/react-router";

async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type DiditPayload = {
  status?: string;
  vendor_data?: string;
  decision?: {
    id_verification?: { document_number?: string; issuing_state?: string; document_type?: string; first_name?: string; last_name?: string; full_name?: string };
  };
};

/**
 * Didit-webhook: handtekening (X-Signature = HMAC-SHA256 van de ruwe body)
 * en tijdstempel (max 5 min) worden gecontroleerd vóór enige schrijfactie.
 */
export const Route = createFileRoute("/api_/public/identity/didit-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["DIDIT_WEBHOOK_SECRET"];
        if (!secret) return new Response("Not configured", { status: 503 });
        const raw = await request.text();
        const ts = Number(request.headers.get("x-timestamp") ?? "0");
        if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) return new Response("Stale", { status: 401 });
        const sig = request.headers.get("x-signature") ?? "";
        if (!safeEqual(sig, await hmacHex(secret, raw))) return new Response("Unauthorized", { status: 401 });

        const payload = JSON.parse(raw) as DiditPayload;
        if (payload.status !== "Approved" || !payload.vendor_data) return Response.json({ ok: true, ignored: true });
        const doc = payload.decision?.id_verification;
        if (!doc?.document_number) return Response.json({ ok: true, ignored: true });

        const id = await import("@/lib/identity/identity.server");
        const session = await id.consumeSession(payload.vendor_data, "didit");
        if (!session) return Response.json({ ok: true, ignored: true });
        const realName = doc.full_name ?? [doc.first_name, doc.last_name].filter(Boolean).join(" ");
        const result = await id.completeVerification({
          userId: session.user_id,
          provider: "didit",
          rawHumanId: `${doc.issuing_state ?? ""}:${doc.document_type ?? ""}:${doc.document_number}`,
          realName,
        });
        return Response.json({ ok: true, result: result.ok ? "verified" : result.reason });
      },
    },
  },
});
