import { createFileRoute } from "@tanstack/react-router";

/** Starts Snap Kit login for the signed-in member (links Snapchat + Bitmoji). */
export const Route = createFileRoute("/api_/snapchat/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const back = (q: string) => new Response(null, { status: 302, headers: { location: `/studio?snapchat=${q}` } });
        const { SITE_ORIGIN } = await import("@/lib/site");
        const reqHost = new URL(request.url).host;
        const siteHost = new URL(SITE_ORIGIN).host;
        // The callback only lands on the registered site, where the session cookie lives.
        if (reqHost !== siteHost && !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(reqHost)) {
          console.warn("[snapchat] start on non-canonical host; sending member to", siteHost);
          return new Response(null, { status: 302, headers: { location: `${SITE_ORIGIN}/api/snapchat/start` } });
        }
        const { currentUser } = await import("@/lib/auth/session.server");
        const user = await currentUser().catch(() => null);
        if (!user) return new Response(null, { status: 302, headers: { location: "/auth/sign-in?next=/studio" } });
        const s = await import("@/lib/snapchat.server");
        if (!s.snapchatConfigured()) {
          console.warn("[snapchat] not configured: SNAPCHAT_CLIENT_ID / SNAPCHAT_CLIENT_SECRET missing");
          return back("not_configured");
        }
        return new Response(null, { status: 302, headers: { location: s.snapchatAuthorizeUrl(user.id, request) } });
      },
    },
  },
});
