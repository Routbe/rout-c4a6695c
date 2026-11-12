import { createFileRoute } from "@tanstack/react-router";

/**
 * Dagelijkse sync van geverifieerde sociale accounts: vernieuwt gecachte
 * volgeraantallen en trekt de verificatie in wanneer de ROUT-link uit de bio is
 * verdwenen. Beveiligd met cronGuard (CRON_SECRET of LOVABLE_CRON_SECRET, constant-time).
 */
async function handle(request: Request) {
  const { cronGuard } = await import("@/lib/cron-auth");
  const denied = await cronGuard(request);
  if (denied) return denied;

  const { syncVerifiedSocialLinks } = await import("@/lib/social-verify.server");
  const result = await syncVerifiedSocialLinks();
  return Response.json(result);
}

export const Route = createFileRoute("/api_/public/cron/sync-socials")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
