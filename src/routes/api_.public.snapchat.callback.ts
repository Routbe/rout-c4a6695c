import { createFileRoute } from "@tanstack/react-router";

/** Snap Kit callback: signed state + live session must name the same member. */
export const Route = createFileRoute("/api_/public/snapchat/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const back = (q: string) => new Response(null, { status: 302, headers: { location: `/studio?snapchat=${q}` } });
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        if (url.searchParams.get("error") || !code) return back("cancelled");
        const s = await import("@/lib/snapchat.server");
        if (!s.snapchatConfigured()) return back("not_configured");
        const stateUser = s.verifySnapState(url.searchParams.get("state") ?? "");
        const { currentUser } = await import("@/lib/auth/session.server");
        const user = await currentUser().catch(() => null);
        if (!stateUser || !user || user.id !== stateUser) return back("invalid_state");
        try {
          await s.exchangeSnapCode(user.id, code, request);
          return back("connected");
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[snapchat] exchange failed", msg);
          return back(msg === "snap_in_use" ? "in_use" : "failed");
        }
      },
    },
  },
});
