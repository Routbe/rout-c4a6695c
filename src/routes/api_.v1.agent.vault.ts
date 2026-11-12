import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/v1/agent/vault — zero-knowledge workspace handoff (Bearer rsk_… sandbox key).
 * Body: { "config": { "name": "…", "slug"?: "…", …any JSON } } (max 32 KiB).
 * The server seals the config with a fresh one-time secret (AES-256-GCM), stores
 * only the ciphertext and an argon2id hash of a claim proof, and returns the RAW
 * secret exactly once. Vaults self-destruct after 1 hour.
 */
export const Route = createFileRoute("/api_/v1/agent/vault")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Proof-of-work first (stateless, cheap to verify), then the sandbox key, then burn the challenge.
        const { requirePow } = await import("@/lib/pow/pow.server");
        const pow = await requirePow(request, "vault");
        if (pow instanceof Response) return pow;
        const { authenticateSandbox } = await import("@/lib/agent/agent-sandbox.server");
        const ctx = await authenticateSandbox(request);
        if (ctx instanceof Response) return ctx;
        // Every refusal below is a compiler-grade diagnostic (error_code, path,
        // rejected_value, suggested_mutation) so the agent can patch and resend.
        const { agentError, agentOk, agentValidationError, agentDiagnosticsError } = await import("@/lib/agent/responses");
        const { VAULT_MAX_CONFIG_BYTES, configByteLength, handoffCode, vaultRequestSchema } = await import("@/lib/vault/ephemeral-vault");
        const { designDiagnostics } = await import("@/lib/vault/design-tokens");
        const text = await request.text();
        const tooLarge = (size: number) =>
          agentDiagnosticsError(413, [{
            error_code: "payload_too_large", path: "config", rejected_value: `${size} bytes`,
            message: `The config may be at most ${VAULT_MAX_CONFIG_BYTES} bytes. Move large assets to URLs.`, suggested_mutation: null,
          }]);
        if (text.length > VAULT_MAX_CONFIG_BYTES * 2) return tooLarge(text.length);
        let raw: unknown = null;
        try {
          raw = JSON.parse(text);
        } catch (e) {
          return agentDiagnosticsError(400, [{
            error_code: "invalid_json", path: "body", rejected_value: text.slice(0, 80),
            message: `Body is not valid JSON (${(e as Error).message.slice(0, 120)}).`,
            suggested_mutation: { op: "replace", path: "", value: { config: { name: "My workspace" } } },
          }]);
        }
        const parsed = vaultRequestSchema.safeParse(raw);
        if (!parsed.success) return agentValidationError(parsed.error, raw, 422);
        const config = parsed.data.config;
        const semantic = designDiagnostics(config.canvas, ["config", "canvas"]);
        if (semantic.length) return agentDiagnosticsError(422, semantic);
        if (configByteLength(config) > VAULT_MAX_CONFIG_BYTES) return tooLarge(configByteLength(config));
        // Burn the challenge only now, so a payload rejected above can be fixed and resent with the same proof.
        const replay = await pow.spend();
        if (replay) return replay;
        try {
          const { createEphemeralVault } = await import("@/lib/vault/ephemeral-vault.server");
          const { claimQrSvg } = await import("@/lib/agent/agent-sandbox.server");
          const { publicOrigin } = await import("@/lib/agent/agent-auth.server");
          const v = await createEphemeralVault(ctx, config);
          const code = handoffCode(v.vaultId, v.secret);
          // The code travels in the URL fragment, which browsers never send to the server.
          const claimUrl = `${publicOrigin(request)}/studio/workspaces/claim#${code}`;
          const svg = await claimQrSvg(claimUrl);
          return agentOk(
            {
              vault_id: v.vaultId,
              ephemeral_secret: v.secret,
              handoff_code: code,
              claim_url: claimUrl,
              claim_qr_svg: `data:image/svg+xml;base64,${btoa(svg)}`,
              expires_at: v.expiresAt,
              human_steps: [
                "In ROUT: the gear icon next to “New workspace” → Claim workspace.",
                "Scan the QR code or paste the handoff code, then unlock your Master Key.",
                "Your browser decrypts the config locally and re-encrypts it with your own key.",
              ],
              note: "Shown once. ROUT stores no secret and cannot read the config after this response. Expires in 1 hour.",
            },
            201,
          );
        } catch (error) {
          // The transport keeps only the SQLSTATE; P0001 is a refusal raised by the
          // vault function (the sandbox was verified just above, so: quota).
          if ((error as { code?: string }).code === "P0001") {
            return agentError(429, "rate_limited", "At most 5 open vaults per sandbox. Wait until one is claimed or expires (1 hour).");
          }
          console.error("[vault] create failed");
          return agentError(500, "server_error", "The vault could not be created right now.");
        }
      },
    },
  },
});
