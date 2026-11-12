import { createFileRoute } from "@tanstack/react-router";

/** GET /.well-known/rout-agent.json — account-less agent sandbox flow, machine-readable. */
export const Route = createFileRoute("/.well-known/rout-agent.json")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { publicOrigin } = await import("@/lib/agent/agent-auth.server");
        const o = publicOrigin(request);
        const body = {
          name: "ROUT agent sandbox",
          about: `${o}/about/ai-agents`,
          ai_manifest: `${o}/ai-manifest.json`,
          pow_challenge: { method: "GET", url: `${o}/api/v1/pow/challenge?scope=vault|workspace`, note: "Single-use proof-of-work; required on heavy operations, sent as x-rout-pow-challenge + x-rout-pow-solution." },
          zero_knowledge_handoff: { method: "POST", url: `${o}/api/v1/agent/vault`, auth: "Bearer rsk_… + proof-of-work headers (scope=vault)", details: `${o}/ai-manifest.json` },
          summary: "Build a complete ROUT workspace without any account; a human claims it within 24 hours.",
          auth: "Bearer sandbox key (rsk_…) from step 2; never send e-mail addresses or personal data.",
          steps: [
            { step: 1, method: "GET", url: `${o}/api/agent/sandbox`, returns: "challenge, difficulty_bits" },
            { step: 2, method: "POST", url: `${o}/api/agent/sandbox`, body: { challenge: "string", solution: "alphanumeric; sha256(challenge+':'+solution) has difficulty_bits leading zero bits", agent_name: "string ≤80" }, returns: "sandbox_key (once)" },
            { step: 3, method: "POST", url: `${o}/api/agent/sandbox/workspace`, headers: "x-rout-pow-challenge + x-rout-pow-solution from GET /api/v1/pow/challenge?scope=workspace", body: { name: "string", slug: "3–48 a-z0-9-", description: "optional" }, returns: "claim_url, claim_code, claim_qr_svg (once)" },
            { step: 4, method: "PATCH", url: `${o}/api/agent/sandbox/profile`, body: { displayName: "", tagline: "", theme: "", cardStyle: "", blocks: [{ id: "", kind: "link|text|heading|divider|contact|social", label: "", value: "" }], displayPrefs: {} } },
            { step: 5, method: "PUT", url: `${o}/api/agent/sandbox/apps`, body: { apps: [{ name: "", redirect_uris: ["https://…"], scopes: ["openid", "profile"] }] } },
            { step: 6, method: "GET", url: `${o}/api/agent/sandbox/workspace`, returns: "draft, apps" },
            { step: 7, action: "Give the human the claim_url, the QR code or the claim_code. They claim via Profile → Personal → gear next to 'New workspace' → Claim workspace." },
          ],
          limits: { sandbox_ttl_hours: 48, sandboxes_per_network_per_day: 5, workspaces_per_sandbox: 1, apps_per_workspace: 3 },
        };
        return new Response(JSON.stringify(body, null, 2), {
          headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" },
        });
      },
    },
  },
});
