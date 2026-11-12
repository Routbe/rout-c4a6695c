import { createFileRoute } from "@tanstack/react-router";

/**
 * Quarantine exit, step 1: a member whose account has no passkey files a
 * recovery request. Always answers 202 (no account enumeration). An admin
 * verifies the person out-of-band and issues a single-use binding link.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const noStore = { "cache-control": "no-store" };

export const Route = createFileRoute("/api_/auth-passkey/recovery")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        const email = typeof body?.["email"] === "string" ? body["email"].trim().toLowerCase() : "";
        const note = typeof body?.["note"] === "string" ? body["note"].trim().slice(0, 1000) || null : null;
        if (!EMAIL.test(email) || email.length > 254) return Response.json({ code: "email_invalid", message: "Vul een geldig e-mailadres in." }, { status: 400, headers: noStore });

        const { hitRateLimit, clientIp } = await import("@/lib/rate-limit-db.server");
        const { RATE_RULES, tooManyRequests } = await import("@/lib/rate-limit-rules");
        const limit = await hitRateLimit("auth", `${clientIp(request)}:/passkey-recovery`, RATE_RULES.authAttempt, { failClosed: true });
        if (!limit.ok) return tooManyRequests(limit.retryAfter);
        const { verifyAltcha } = await import("@/lib/altcha.server");
        const altcha = await verifyAltcha(request.headers.get("x-altcha"));
        if (!altcha.ok) return Response.json({ code: "altcha_invalid", reason: altcha.reason, message: "Botcontrole mislukt. Probeer het opnieuw." }, { status: 400, headers: noStore });

        try {
          const { fileRecoveryRequest } = await import("@/lib/auth/quarantine.server");
          await fileRecoveryRequest(email, note);
        } catch (e) {
          console.error("[recovery] filing failed", e instanceof Error ? e.message : e);
        }
        return Response.json({ ok: true }, { status: 202, headers: noStore });
      },
    },
  },
});
