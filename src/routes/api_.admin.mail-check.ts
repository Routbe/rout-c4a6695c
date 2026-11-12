import { createFileRoute } from "@tanstack/react-router";

/**
 * Admin mail diagnostic. GET returns only booleans (no secrets, no addresses).
 * POST sends one test mail to the configured owner addresses only, rate-limited.
 */
export const Route = createFileRoute("/api_/admin/mail-check")({
  server: {
    handlers: {
      GET: async () => {
        const { hasDatabase, sql } = await import("@/lib/neon");
        const { isMailConfigured } = await import("@/emails/send.server");
        const { appMode } = await import("@/lib/app-mode");
        let dbReachable = false;
        if (hasDatabase()) {
          try { await sql`select 1`; dbReachable = true; } catch (err) { console.error("[admin-mail-check] db", err); }
        }
        return Response.json(
          {
            mode: appMode(),
            mailConfigured: isMailConfigured(),
            databaseConfigured: hasDatabase(),
            databaseReachable: dbReachable,
            ownerEmailsConfigured: Boolean(process.env["OWNER_EMAILS"] ?? process.env["ADMIN_EMAIL"]),
            authUrlConfigured: Boolean(process.env["BETTER_AUTH_URL"] ?? process.env["NEXT_PUBLIC_APP_URL"]),
          },
          { headers: { "cache-control": "no-store" } },
        );
      },
      POST: async ({ request }) => {
        const { hitRateLimit, clientIp } = await import("@/lib/rate-limit-db.server");
        const { RATE_RULES, tooManyRequests } = await import("@/lib/rate-limit-rules");
        const limit = await hitRateLimit("auth", `${clientIp(request)}:admin-mail-check`, RATE_RULES.authAttempt);
        if (!limit.ok) return tooManyRequests(limit.retryAfter);
        // Only a signed-in admin may trigger the test mail.
        const { currentUser } = await import("@/lib/auth/session.server");
        const user = await currentUser().catch(() => null);
        if (!user) return Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
        try {
          const { assertAdminRole } = await import("@/lib/admin.server");
          await assertAdminRole(user.id);
        } catch {
          return Response.json({ error: "forbidden" }, { status: 403, headers: { "cache-control": "no-store" } });
        }
        const { configuredOwnerEmails } = await import("@/lib/auth/owner-admin.server");
        const { sendMail } = await import("@/emails/send.server");
        const results: { sent: boolean }[] = [];
        for (const to of configuredOwnerEmails()) {
          const r = await sendMail({ to, subject: "ROUT beheer — testmail", html: "<p>Testmail van het beheerportaal.</p>", text: "Testmail van het beheerportaal.", tags: ["admin-mail-check"] });
          if (r.error) console.error("[admin-mail-check] send failed", r.error);
          results.push({ sent: r.sent });
        }
        return Response.json({ results }, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
