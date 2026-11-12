import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * NFC Secure Element handshake — the only physical-card authorisation path.
 * step "challenge": issue a single-use nonce for an active chip.
 * step "verify": consume the nonce, check the chip signature and the live
 * kill-switch, then return a 5-minute terminal access token.
 */
const Body = z.discriminatedUnion("step", [
  z.object({ step: z.literal("challenge"), hardwareId: z.string().uuid() }),
  z.object({ step: z.literal("verify"), hardwareId: z.string().uuid(), nonce: z.string().regex(/^[A-Za-z0-9_-]{22,64}$/), signature: z.string().max(200) }),
]);

const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { "cache-control": "no-store" } });

export const Route = createFileRoute("/api_/hardware/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { hitRateLimit, clientIp } = await import("@/lib/rate-limit-db.server");
        const limit = await hitRateLimit("hw-verify", clientIp(request), { limit: 30, windowSec: 60 }, { failClosed: true });
        if (!limit.ok) return json({ ok: false, error: "limited" }, 429);
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ ok: false, error: "bad_request" }, 400);
        const d = parsed.data;
        const hw = await import("@/lib/wallet/hardware-crypto");
        const store = await import("@/lib/wallet/card-freeze.server");
        if (d.step === "challenge") {
          const nonce = hw.b64urlEncode(crypto.getRandomValues(new Uint8Array(32)));
          const ok = await store.issueChallenge(d.hardwareId, await hw.sha256Hex(nonce)).catch(() => null);
          return ok === true ? json({ ok: true, channel: "hardware-handshake", nonce }) : json({ ok: false, error: "denied" }, 403);
        }
        const key = await store.consumeChallenge(d.hardwareId, await hw.sha256Hex(d.nonce)).catch(() => null);
        const alg = key?.key_alg === "Ed25519" || key?.key_alg === "P-256" ? key.key_alg : null;
        const good = !!key && !!alg && (await hw.verifyChipSignature(alg, key.public_key, hw.challengeMessage(d.hardwareId, d.nonce), d.signature));
        await store.recordScan(d.hardwareId, good);
        if (!good) return json({ ok: false, error: "denied" }, 403);
        const { livenessKey } = await import("@/lib/wallet/card-liveness.server");
        const token = await hw.signAccessToken(await livenessKey(), d.hardwareId, Date.now());
        return json({ ok: true, channel: "hardware-handshake", accessToken: token });
      },
    },
  },
});
