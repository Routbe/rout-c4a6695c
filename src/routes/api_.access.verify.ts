import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Blind verifier for the payment/access QR on the back of the ROUT Card and the
 * Google Wallet payment pass. Accepts only `rout:access:<token>` and the rotating
 * `rout:wk:<key id>:<digits>`; any web or profile URL gets 403.
 * Returns validity only, never names, e-mail or profile data.
 */
const Body = z.object({ payload: z.string().min(1).max(700) });
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { "cache-control": "no-store" } });

export const Route = createFileRoute("/api_/access/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { hitRateLimit, clientIp } = await import("@/lib/rate-limit-db.server");
        const limit = await hitRateLimit("access-verify", clientIp(request), { limit: 30, windowSec: 60 }, { failClosed: true });
        if (!limit.ok) return json({ valid: false, error: "limited" }, 429);
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ valid: false, error: "bad_request" }, 400);
        if (parsed.data.payload.startsWith("rout:wk:")) {
          const { verifyWalletKeyQr, walletKeyQrNonce } = await import("@/lib/wallet/wallet-key.server");
          const { KEY_TOTP_PERIOD_MS } = await import("@/lib/wallet/wallet-key");
          const now = Date.now();
          const k = await verifyWalletKeyQr(parsed.data.payload, process.env["WALLET_ID_SECRET"], now);
          if (!k.ok) return json({ valid: false, error: "invalid" }, 403);
          // A frozen, blocked or replaced key never verifies, even with a correct code.
          const { useTokenNonce, validateCardActive } = await import("@/lib/wallet/card-freeze.server");
          if (!(await validateCardActive(`key_${k.keyId}`))) return json({ valid: false, error: "frozen" }, 403);
          // A code stays acceptable until the end of the next step; keep its marker that long (max 60 s ahead).
          const exp = Math.min(now + 60_000, (k.step + 2) * KEY_TOTP_PERIOD_MS);
          const first = await useTokenNonce(await walletKeyQrNonce(k.keyId, k.step), exp).catch(() => null);
          if (first !== true) return json({ valid: false, error: first === false ? "replayed" : "invalid" }, 403);
          return json({ valid: true, replay_protected: true });
        }
        const { parseAccessPayload } = await import("@/lib/wallet/card-token");
        const p = parseAccessPayload(parsed.data.payload);
        if (!p.ok) return json({ valid: false, error: p.reason }, 403);
        const { verifySecureCardTokenCore } = await import("@/lib/wallet/card-verify.server");
        const v = await verifySecureCardTokenCore(p.token);
        if (v.status !== "valid") return json({ valid: false, error: v.status }, 403);
        return json({ valid: true, replay_protected: true });
      },
    },
  },
});
