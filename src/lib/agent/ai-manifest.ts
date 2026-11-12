/**
 * `/ai-manifest.json`: one stateless document from which any agent (OpenAI,
 * Claude, a curl script) can discover and use the zero-knowledge vault API.
 * Pure; schemas are generated from the same Zod definitions the API enforces.
 */
import { z } from "zod";
import { POW_BITS, POW_CHALLENGE_HEADER, POW_SOLUTION_HEADER } from "@/lib/pow/pow";
import { vaultRequestSchema, VAULT_MAX_CONFIG_BYTES, VAULT_TTL_MINUTES } from "@/lib/vault/ephemeral-vault";
import { CONTRAST_RULES, RADIUS_TOKENS, TYPOGRAPHY_FAMILIES, designCanvasSchema } from "@/lib/vault/design-tokens";

const DIAGNOSTIC_SCHEMA = {
  type: "object",
  required: ["error_code", "path", "rejected_value", "suggested_mutation"],
  properties: {
    error_code: {
      enum: ["invalid_design_token", "unknown_design_token", "insufficient_contrast", "unknown_field", "missing_field", "wrong_type", "invalid_enum", "out_of_range", "too_long", "invalid_json", "payload_too_large", "rule_violation", "invalid_value"],
    },
    path: { type: "string", description: "Dotted location in the request body, e.g. config.canvas.theme.background" },
    rejected_value: { description: "What you sent (strings truncated at 200 chars)" },
    message: { type: "string" },
    suggested_mutation: {
      description: "RFC 6902 JSON Patch operation; apply it to your body and resend. null = no automatic fix.",
      oneOf: [
        { type: "null" },
        { type: "object", required: ["op", "path"], properties: { op: { enum: ["add", "remove", "replace", "move"] }, path: { type: "string" }, from: { type: "string" }, value: {} } },
      ],
    },
  },
} as const;

/** Machine-readable syntax tree of the design tokens: node types, allowed values and cross-token rules. */
export function designTokenAst() {
  return {
    root: "config.canvas",
    json_schema: z.toJSONSchema(designCanvasSchema),
    nodes: [
      { path: "canvas.theme.background", type: "color", format: "#RRGGBB", required: true },
      { path: "canvas.theme.text", type: "color", format: "#RRGGBB", required: true },
      { path: "canvas.theme.accent", type: "color", format: "#RRGGBB", required: false },
      { path: "canvas.theme.card", type: "color", format: "#RRGGBB", required: false },
      { path: "canvas.typography.family", type: "enum", values: [...TYPOGRAPHY_FAMILIES], required: false },
      { path: "canvas.typography.scale", type: "number", min: 0.8, max: 1.4, required: false },
      { path: "canvas.radius", type: "enum", values: [...RADIUS_TOKENS], required: false },
    ],
    rules: CONTRAST_RULES.map((r) => ({
      id: r.id,
      kind: "min_contrast_ratio",
      standard: "WCAG 2.1",
      foreground: `canvas.theme.${r.fg}`,
      background: `canvas.theme.${r.bg}`,
      min_ratio: r.min,
    })),
    unknown_keys: "rejected with error_code unknown_design_token; suggested_mutation is a JSON Patch move to the closest known key when one exists",
  };
}

export function aiManifest(origin: string) {
  const errorBody = {
    allOf: [
      { type: "object", properties: { status: { const: "error" }, error: { type: "string" }, message: { type: "string" }, retry_hint: { type: "string" } } },
      DIAGNOSTIC_SCHEMA,
      { type: "object", properties: { diagnostics: { type: "array", items: DIAGNOSTIC_SCHEMA } } },
    ],
  };
  const json = (schema: unknown) => ({ "application/json": { schema } });
  return {
    schema_version: "1.0",
    name: "ROUT",
    description: "Sovereign Digital Identity OS. Agents provision a workspace design and hand it to a human through a zero-knowledge vault.",
    transport: {
      style: "stateless REST over HTTPS (JSON)",
      stateful_session_required: false,
      websocket_required: false,
      mcp_required: false,
      note: "Every call is independent and authenticated by a header. MCP is optional extra tooling, never needed for provisioning.",
    },
    discovery: {
      robots: `${origin}/robots.txt`,
      openapi_full: `${origin}/.well-known/openapi.json`,
      sandbox_flow: `${origin}/.well-known/rout-agent.json`,
      llms_txt: `${origin}/llms.txt`,
      docs: `${origin}/about/ai-agents`,
    },
    quickstart: [
      { step: 1, call: `GET ${origin}/api/agent/sandbox`, returns: "challenge, difficulty_bits" },
      { step: 2, call: `POST ${origin}/api/agent/sandbox`, body: { challenge: "…", solution: "sha256(challenge+':'+solution) has difficulty_bits leading zero bits", agent_name: "…" }, returns: "sandbox_key (rsk_…, 48 h)" },
      { step: 3, call: `GET ${origin}/api/v1/pow/challenge?scope=vault`, returns: "challenge, difficulty_bits (single use, 10 min). Solve it like step 2." },
      { step: 3.5, call: `POST ${origin}/api/v1/agent/vault`, headers: { authorization: "Bearer rsk_…", [POW_CHALLENGE_HEADER]: "<challenge>", [POW_SOLUTION_HEADER]: "<solution>" }, body: { config: { name: "My workspace", canvas: { theme: { background: "#FFFFFF", text: "#111111" } } } }, returns: "vault_id, ephemeral_secret, handoff_code, claim_url, claim_qr_svg" },
      { step: 4, action: "Give the human the claim_url, the QR code or the handoff_code. They open ROUT → gear icon next to 'New workspace' → Claim workspace." },
      { step: 5, on_error: "Read diagnostics[], apply each suggested_mutation (JSON Patch) to your body, resend. Repeat until 201." },
    ],
    zero_knowledge: {
      cipher: "AES-256-GCM, key = HKDF-SHA256(ephemeral_secret, info 'rout.vault.v1.enc'), AAD 'rout.vault.v1:<vault_id>'",
      stored_server_side: ["ciphertext", "argon2id(HKDF(ephemeral_secret, 'rout.vault.v1.claim'))", "expires_at"],
      never_stored: ["ephemeral_secret", "plaintext config", "the human's Master Key"],
      ttl_minutes: VAULT_TTL_MINUTES,
      claim: "The human's browser decrypts locally, re-encrypts with the human's own key and commits; the vault is then hard-deleted.",
    },
    design_token_ast: designTokenAst(),
    openapi: {
      openapi: "3.1.0",
      info: { title: "ROUT zero-knowledge vault API", version: "1.0.0" },
      servers: [{ url: origin }],
      components: {
        securitySchemes: { sandbox_key: { type: "http", scheme: "bearer", bearerFormat: "rsk_<64 hex>", description: "From POST /api/agent/sandbox (proof-of-work, no account)." } },
        schemas: { Diagnostic: DIAGNOSTIC_SCHEMA, DiagnosticError: errorBody },
      },
      paths: {
        "/api/v1/agent/vault": {
          post: {
            operationId: "createEphemeralVault",
            summary: "Seal a workspace design in a one-hour zero-knowledge vault",
            security: [{ sandbox_key: [] }],
            parameters: [
              { name: POW_CHALLENGE_HEADER, in: "header", required: true, description: "From GET /api/v1/pow/challenge?scope=vault (single use).", schema: { type: "string", maxLength: 300 } },
              { name: POW_SOLUTION_HEADER, in: "header", required: true, description: `sha256(challenge + ':' + solution) has ${POW_BITS.vault} leading zero bits.`, schema: { type: "string", pattern: "^[0-9A-Za-z]{1,64}$" } },
            ],
            requestBody: { required: true, content: json(z.toJSONSchema(vaultRequestSchema)) },
            responses: {
              "201": {
                description: "Vault created. ephemeral_secret is shown once and never stored.",
                content: json({
                  type: "object",
                  properties: {
                    status: { const: "ok" },
                    vault_id: { type: "string", format: "uuid" },
                    ephemeral_secret: { type: "string", pattern: "^[A-Za-z0-9_-]{43}$" },
                    handoff_code: { type: "string", pattern: "^rvh1_[0-9a-f]{32}_[A-Za-z0-9_-]{43}$" },
                    claim_url: { type: "string", format: "uri" },
                    claim_qr_svg: { type: "string" },
                    expires_at: { type: "string", format: "date-time" },
                    human_steps: { type: "array", items: { type: "string" } },
                  },
                }),
              },
              "400": { description: "Malformed JSON (diagnostic with suggested_mutation)", content: json({ $ref: "#/components/schemas/DiagnosticError" }) },
              "401": { description: "challenge_required (missing, wrong, expired or reused proof-of-work; see WWW-Authenticate: PoW …) or invalid_token (sandbox key)" },
              "413": { description: `Config larger than ${VAULT_MAX_CONFIG_BYTES} bytes`, content: json({ $ref: "#/components/schemas/DiagnosticError" }) },
              "422": { description: "Invalid design tokens or rule violation; apply suggested_mutation and resend", content: json({ $ref: "#/components/schemas/DiagnosticError" }) },
              "429": { description: "Rate limit or 5 open vaults per sandbox" },
            },
          },
        },
      },
    },
  };
}
