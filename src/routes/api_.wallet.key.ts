import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/wallet/key — the signed-in member's own Apple "Sovereign Key" (.pkpass).
 * Owner-only, no QR, no profile data; an NFC (VAS) token only. Needs Apple's NFC
 * pass entitlement (APPLE_WALLET_NFC_PUBLIC_KEY) and WALLET_ID_SECRET, else 503.
 * Same gate as the Google key: 2FA on, card active and unlocked by a fresh
 * verification, and always the key of the current card generation.
 */
export const Route = createFileRoute("/api_/wallet/key")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const headers = { "cache-control": "no-store" };
        const { currentUser } = await import("@/lib/auth/session.server");
        const user = await currentUser();
        if (!user) return Response.json({ error: "unauthorized" }, { status: 401, headers });
        const { isVerifiedMember } = await import("@/lib/wallet/wallet-verified.server");
        if (!(await isVerifiedMember(user.id))) return Response.json({ error: "not_verified" }, { status: 403, headers });
        const { isPlatformFeatureEnabled } = await import("@/lib/platform-features.server");
        if (!(await isPlatformFeatureEnabled("wallet"))) return Response.json({ error: "feature_disabled" }, { status: 403, headers });
        const { guardShared } = await import("@/lib/rate-limit-db.server");
        const limited = await guardShared(request, "wallet-key", { limit: 10, windowSec: 60 });
        if (limited) return limited;
        const { memberHasTwoFactor, myRootCard } = await import("@/lib/wallet/card-owner.server");
        if (!(await memberHasTwoFactor(user.id))) return Response.json({ error: "two_factor_required" }, { status: 403, headers });
        const mine = await myRootCard(user.id).catch(() => null);
        if (!mine) return Response.json({ error: "no_profile" }, { status: 403, headers });
        if (mine.state !== "active") return Response.json({ error: "card_inactive" }, { status: 403, headers });
        const { cardUnlockedUntil } = await import("@/lib/wallet/card-unlock.server");
        if (!(await cardUnlockedUntil(user.id))) return Response.json({ error: "locked" }, { status: 401, headers });
        const env = process.env as Record<string, string | undefined>;
        const { appleWalletConfig } = await import("@/lib/wallet/wallet-pass");
        const { appleNfcConfig, appleKeyPassJson } = await import("@/lib/wallet/wallet-key");
        const cfg = appleWalletConfig(env);
        const nfc = appleNfcConfig(env);
        if (!cfg || !nfc) return Response.json({ error: "key_not_configured" }, { status: 503, headers });
        const { walletKeyPayload } = await import("@/lib/wallet/wallet-key.server");
        const key = await walletKeyPayload(user.id, env["WALLET_ID_SECRET"], Date.now(), mine.generation);
        if (!key) return Response.json({ error: "key_not_configured" }, { status: 503, headers });
        try {
          const { walletOrigin } = await import("@/lib/wallet/wallet-payload.server");
          const base = walletOrigin();
          const img = async (path: string) => new Uint8Array(await (await fetch(`${base}${path}`)).arrayBuffer());
          const [icon, icon2x, logo] = await Promise.all([img("/favicon.png"), img("/icon-192.png"), img("/apple-touch-icon.png")]);
          const { signPkpass } = await import("@/lib/wallet/apple-wallet.server");
          const bytes = await signPkpass(appleKeyPassJson(key, { passTypeId: cfg.passTypeId, teamId: cfg.teamId }, nfc), { "icon.png": icon, "icon@2x.png": icon2x, "logo.png": logo }, cfg);
          return new Response(bytes as unknown as BodyInit, {
            headers: { ...headers, "content-type": "application/vnd.apple.pkpass", "content-disposition": 'attachment; filename="rout-sovereign-key.pkpass"' },
          });
        } catch {
          console.error("[wallet] key pass signing failed");
          return Response.json({ error: "wallet_issue_failed" }, { status: 500, headers });
        }
      },
    },
  },
});
