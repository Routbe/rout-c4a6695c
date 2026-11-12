import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/wallet/google?username=<handle>  [&space=root|alias]
 * Internal account ids are never accepted here: they must not be probeable from outside.
 * Returns { jwt, saveUrl } for "Add to Google Wallet". Public profile data only;
 * signing runs server-side (async WebCrypto), never on the visitor's main thread.
 * Without a configured issuer: 503 wallet_not_configured with an unsigned demo payload.
 */
export const Route = createFileRoute("/api_/wallet/google")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { currentUser } = await import("@/lib/auth/session.server");
        const user = await currentUser();
        if (!user) return Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
        const url = new URL(request.url);
        const username = url.searchParams.get("username")?.trim().replace(/^@+/, "") ?? "";
        if (url.searchParams.has("user_id")) {
          return Response.json({ error: "user_id_not_accepted", message: "Use the public username." }, { status: 400 });
        }
        const target = username;
        if (!target || !/^[\w.-]{1,100}$/.test(username)) {
          return Response.json({ error: "invalid_request" }, { status: 400 });
        }
        const { isPlatformFeatureEnabled } = await import("@/lib/platform-features.server");
        if (!(await isPlatformFeatureEnabled("wallet"))) return Response.json({ error: "feature_disabled" }, { status: 403, headers: { "cache-control": "no-store" } });
        const space = url.searchParams.get("space") === "alias" ? "alias" : url.searchParams.get("space") === "root" ? "root" : undefined;
        const { guardShared } = await import("@/lib/rate-limit-db.server");
        const limited = await guardShared(request, "wallet-google", { limit: 30, windowSec: 60 });
        if (limited) return limited;
        const headers = { "cache-control": "no-store" };
        try {
          const { generateWalletPayload, walletOrigin } = await import("@/lib/wallet/wallet-payload.server");
          const { withDbContext } = await import("@/lib/neon");
          const own = await withDbContext({ userId: user.id, workspaceId: null }, () => generateWalletPayload(user.id, { space, allowAccountId: true }));
          const { canClaimWalletCard } = await import("@/lib/wallet/wallet-claim");
          if (!canClaimWalletCard(own, target, space)) return Response.json({ error: "forbidden" }, { status: 403, headers });
          const card = await generateWalletPayload(target, { space });
          if (!card) return Response.json({ error: "not_found" }, { status: 404, headers });
          const { googleWalletConfig, googleCardSaveClaims } = await import("@/lib/wallet/wallet-pass");
          const cfg = googleWalletConfig(process.env as Record<string, string | undefined>);
          if (!cfg) {
            return Response.json(
              { error: "wallet_not_configured", message: "Google Wallet is nog niet ingesteld; dit is een niet-ondertekende demo.", demo: googleCardSaveClaims(card, { issuerId: "DEMO", serviceAccountEmail: "demo@example.invalid", origins: [walletOrigin()] }) },
              { status: 503, headers },
            );
          }
          const { googleCardSave } = await import("@/lib/wallet/google-wallet.server");
          // Owner-verified above: refresh an already-saved pass, since Google ignores the JWT object then.
          const { syncGoogleCardQuietly } = await import("@/lib/wallet/google-wallet-sync.server");
          const sync = await syncGoogleCardQuietly(card, walletOrigin(), cfg);
          const { jwt, saveUrl } = await googleCardSave(card, walletOrigin(), cfg);
          return Response.json({ jwt, saveUrl, updatedExisting: sync.object === "updated" }, { headers });
        } catch (e) {
          console.error("[wallet] google card failed", (e as Error)?.message);
          return Response.json({ error: "wallet_issue_failed" }, { status: 500, headers });
        }
      },
    },
  },
});
