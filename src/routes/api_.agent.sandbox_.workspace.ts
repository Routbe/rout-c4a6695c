import { createFileRoute } from "@tanstack/react-router";

/**
 * Sandbox workspace (Bearer rsk_… key).
 * POST → create the one unowned workspace; returns claim link, claim code and
 *        QR code (SVG data URI) exactly once.
 * GET  → current draft, revision and login-app specs.
 */
export const Route = createFileRoute("/api_/agent/sandbox_/workspace")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Proof-of-work first (stateless, cheap to verify), then the sandbox key, then burn the challenge.
        const { requirePow } = await import("@/lib/pow/pow.server");
        const pow = await requirePow(request, "workspace");
        if (pow instanceof Response) return pow;
        const { authenticateSandbox } = await import("@/lib/agent/agent-sandbox.server");
        const ctx = await authenticateSandbox(request);
        if (ctx instanceof Response) return ctx;
        const { agentError, agentOk } = await import("@/lib/agent/responses");
        if (ctx.workspaceId) return agentError(400, "invalid_request", "This sandbox already has a workspace. One sandbox = one workspace.");
        const { agentProvisionInput, claimUrl } = await import("@/lib/agent/agent-claims");
        const rawBody: unknown = await request.json().catch(() => null);
        const parsed = agentProvisionInput.safeParse(rawBody);
        if (!parsed.success) return (await import("@/lib/agent/responses")).agentValidationError(parsed.error, rawBody);
        const replay = await pow.spend();
        if (replay) return replay;
        try {
          const { provisionSandboxWorkspace, claimQrSvg } = await import("@/lib/agent/agent-sandbox.server");
          const { publicOrigin } = await import("@/lib/agent/agent-auth.server");
          const ws = await provisionSandboxWorkspace(ctx, parsed.data);
          const url = claimUrl(publicOrigin(request), ws.claimToken);
          const svg = await claimQrSvg(url);
          return agentOk(
            {
              workspace_id: ws.workspaceId,
              slug: ws.slug,
              expires_at: ws.expiresAt,
              claim_url: url,
              claim_code: ws.claimCode,
              claim_qr_svg: `data:image/svg+xml;base64,${btoa(svg)}`,
              human_steps: [
                "Open the claim link, or:",
                "In ROUT: Profile → Personal → the gear icon next to “New workspace” → Claim workspace.",
                "Scan the QR code or type the claim code, then sign in and confirm.",
              ],
              note: "Shown once. Single-use; expires with the sandbox (24 h). ROUT sends no e-mail. Nothing is public until claimed.",
            },
            201,
          );
        } catch (error) {
          const m = (error as Error).message ?? "";
          if (m.includes("slug_taken")) return agentError(400, "invalid_request", "That workspace slug is already taken. Choose another one.");
          console.error("[agent:sandbox] provision failed");
          return agentError(500, "server_error", "The workspace could not be created right now.");
        }
      },
      GET: async ({ request }) => {
        const { authenticateSandbox, readSandboxState } = await import("@/lib/agent/agent-sandbox.server");
        const ctx = await authenticateSandbox(request);
        if (ctx instanceof Response) return ctx;
        const { agentError, agentOk } = await import("@/lib/agent/responses");
        if (!ctx.workspaceId) return agentError(404, "not_found", "Create the workspace first (POST).");
        const state = await readSandboxState(ctx);
        return agentOk({ workspace_id: ctx.workspaceId, slug: ctx.slug, expires_at: ctx.expiresAt, draft: state?.draft ?? null, revision: state?.revision ?? null, apps: state?.apps ?? [] });
      },
    },
  },
});
