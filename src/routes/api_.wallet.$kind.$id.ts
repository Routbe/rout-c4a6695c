import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/wallet/<profile|event>/<handle|slug>?type=apple|google[&space=root|alias]
 * Apple: signed .pkpass. Google: redirect to "Save to Google Wallet".
 * Without certificates: 503 wallet_not_configured with an unsigned demo payload.
 */
export const Route = createFileRoute("/api_/wallet/$kind/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { isWalletKind } = await import("@/lib/wallet/wallet-pass");
        const url = new URL(request.url);
        const type = url.searchParams.get("type");
        if (!isWalletKind(params.kind) || (type !== "apple" && type !== "google") || !/^[\w.-]{1,100}$/.test(params.id)) {
          return Response.json({ error: "invalid_request" }, { status: 400 });
        }
        if (type === "google" && params.kind === "profile") {
          const { currentUser } = await import("@/lib/auth/session.server");
          const user = await currentUser();
          const headers = { "cache-control": "no-store" };
          if (!user) return Response.json({ error: "unauthorized" }, { status: 401, headers });
          const space = url.searchParams.get("space") === "alias" ? "alias" : "root";
          const { generateWalletPayload } = await import("@/lib/wallet/wallet-payload.server");
          const { withDbContext } = await import("@/lib/neon");
          const own = await withDbContext({ userId: user.id, workspaceId: null }, () => generateWalletPayload(user.id, { space, allowAccountId: true }));
          const { canClaimWalletCard } = await import("@/lib/wallet/wallet-claim");
          if (!canClaimWalletCard(own, params.id, space)) return Response.json({ error: "forbidden" }, { status: 403, headers });
          const { isVerifiedMember } = await import("@/lib/wallet/wallet-verified.server");
          if (!(await isVerifiedMember(user.id))) return Response.json({ error: "not_verified" }, { status: 403, headers });
        }
        const { isPlatformFeatureEnabled } = await import("@/lib/platform-features.server");
        if (!(await isPlatformFeatureEnabled("wallet"))) return Response.json({ error: "feature_disabled" }, { status: 403, headers: { "cache-control": "no-store" } });
        const { guardShared } = await import("@/lib/rate-limit-db.server");
        const limited = await guardShared(request, "wallet-pass", { limit: 30, windowSec: 60 });
        if (limited) return limited;
        try {
          const { generatePass } = await import("@/lib/wallet/pass-generator.server");
          const space = url.searchParams.get("space") === "alias" ? "alias" : url.searchParams.get("space") === "root" ? "root" : undefined;
          const r = await generatePass(params.kind, params.id, type, url.origin, space);
          if (r.kind === "not_found") return Response.json({ error: "not_found" }, { status: 404 });
          if (r.kind === "demo") {
            return Response.json(
              { error: "wallet_not_configured", wallet: r.wallet, message: "Wallet-certificaten zijn nog niet ingesteld; dit is een niet-ondertekende demo.", demo: r.payload },
              { status: 503, headers: { "cache-control": "no-store" } },
            );
          }
          if (r.kind === "redirect") return new Response(null, { status: 302, headers: { location: r.url, "cache-control": "no-store" } });
          return new Response(r.bytes as unknown as BodyInit, {
            headers: {
              "content-type": "application/vnd.apple.pkpass",
              "content-disposition": `attachment; filename="${r.filename}"`,
              "cache-control": "no-store",
            },
          });
        } catch (e) {
          console.error("[wallet] issue failed", type, (e as Error)?.message);
          return Response.json({ error: "wallet_issue_failed", wallet: type }, { status: 500 });
        }
      },
    },
  },
});
