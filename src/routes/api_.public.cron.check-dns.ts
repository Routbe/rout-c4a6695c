import { createFileRoute } from "@tanstack/react-router";

/**
 * Geautomatiseerde DNS-propagatiecontrole: promoot elk profiel met status
 * `pending_dns` waarvan `[handle].rout.be` naar cname.vercel-dns.com wijst.
 * Beveiligd met cronGuard (CRON_SECRET of LOVABLE_CRON_SECRET, constant-time).
 */
async function handle(request: Request) {
  const { cronGuard } = await import("@/lib/cron-auth");
  const denied = await cronGuard(request);
  if (denied) return denied;

  const { runDnsPropagationCheck } = await import("@/lib/subdomain-claims.server");
  const result = await runDnsPropagationCheck();
  const { recheckDomainClaims } = await import("@/lib/domain-claims.server");
  const claims = await recheckDomainClaims().catch(() => ({ checked: 0, released: 0, error: true }));
  return Response.json({ success: true, ...result, domainClaims: claims });
}

export const Route = createFileRoute("/api_/public/cron/check-dns")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
