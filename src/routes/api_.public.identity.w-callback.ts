import { createFileRoute } from "@tanstack/react-router";

const back = (origin: string, result: string) => Response.redirect(`${origin}/settings?identity=${result}`, 302);

/**
 * W Identity OIDC-callback. De state is single-use en gebonden aan de
 * gebruiker die de flow startte; de pairwise `sub` wordt gepeperd gehasht.
 */
export const Route = createFileRoute("/api_/public/identity/w-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = url.origin;
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state) return back(origin, "failed");
        const id = await import("@/lib/identity/identity.server");
        if (!id.providerConfigured("w_identity")) return back(origin, "not_configured");
        const session = await id.consumeSession(state, "w_identity");
        if (!session) return back(origin, "expired");

        try {
          const issuer = process.env["W_IDENTITY_ISSUER"]!.replace(/\/$/, "");
          const disco = (await (await fetch(`${issuer}/.well-known/openid-configuration`)).json()) as {
            token_endpoint: string;
            userinfo_endpoint: string;
          };
          const tokenRes = await fetch(disco.token_endpoint, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "authorization_code",
              code,
              redirect_uri: `${origin}/api/public/identity/w-callback`,
              client_id: process.env["W_IDENTITY_CLIENT_ID"]!,
              client_secret: process.env["W_IDENTITY_CLIENT_SECRET"]!,
              code_verifier: session.code_verifier ?? "",
            }),
          });
          if (!tokenRes.ok) {
            console.error(`[identity] W token exchange failed [${tokenRes.status}]`);
            return back(origin, "failed");
          }
          const { access_token } = (await tokenRes.json()) as { access_token: string };
          const infoRes = await fetch(disco.userinfo_endpoint, { headers: { authorization: `Bearer ${access_token}` } });
          if (!infoRes.ok) return back(origin, "failed");
          const info = (await infoRes.json()) as { sub?: string; name?: string; given_name?: string; family_name?: string };
          const realName = info.name ?? [info.given_name, info.family_name].filter(Boolean).join(" ");
          if (!info.sub) return back(origin, "failed");
          const result = await id.completeVerification({
            userId: session.user_id,
            provider: "w_identity",
            rawHumanId: info.sub,
            realName,
          });
          return back(origin, result.ok ? "verified" : result.reason);
        } catch (error) {
          console.error("[identity] W callback error", error instanceof Error ? error.message : "unknown");
          return back(origin, "failed");
        }
      },
    },
  },
});
