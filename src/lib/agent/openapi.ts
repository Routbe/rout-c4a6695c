import { AGENT_SCOPE_DESCRIPTIONS, AGENT_TOKEN_TTL_MAX_S } from "./agent-scopes";

/** Machine-readable description of the agent API (OpenAPI 3.1). Pure. */
export function agentOpenApi(origin: string) {
  const errorRef = { $ref: "#/components/schemas/Error" };
  const json = (schema: unknown) => ({ "application/json": { schema } });
  return {
    openapi: "3.1.0",
    info: {
      title: "ROUT Agent API",
      version: "1.0.0",
      description:
        `ROUT is the Sovereign Digital Identity OS. Agents act for a member who approved them via OAuth 2.1 + PKCE at ${origin}/connect. ` +
        `Access tokens carrying agent scopes live at most ${AGENT_TOKEN_TTL_MAX_S / 60} minutes. Steps only a human may take answer HTTP 202 ` +
        "with status `human_action_required` and a temporary `action_url`; plan limits answer HTTP 402 with `upgrade_url`.",
    },
    servers: [{ url: origin }],
    components: {
      securitySchemes: {
        rout_oauth: {
          type: "oauth2",
          flows: {
            authorizationCode: {
              authorizationUrl: `${origin}/connect`,
              tokenUrl: `${origin}/api/public/oauth/token`,
              refreshUrl: `${origin}/api/public/oauth/token`,
              scopes: { openid: "Identify the member", ...AGENT_SCOPE_DESCRIPTIONS },
            },
          },
        },
      },
      schemas: {
        Error: { type: "object", properties: { status: { const: "error" }, error: { type: "string" }, message: { type: "string" } } },
        HumanActionRequired: {
          type: "object",
          properties: {
            status: { const: "human_action_required" },
            action: { enum: ["publish_profile", "verify_identity", "verify_domain", "sign_in"] },
            reason: { type: "string" },
            action_url: { type: "string", format: "uri" },
            expires_at: { type: "string", format: "date-time" },
            result: { type: "object" },
          },
        },
        PaymentRequired: {
          type: "object",
          properties: { status: { const: "payment_required" }, reason: { type: "string" }, upgrade_url: { type: "string", format: "uri" }, limit: { type: "string" } },
        },
      },
    },
    paths: {
      "/api/agent/identity": {
        get: {
          summary: "Public verification status of the member",
          security: [{ rout_oauth: ["identity:read_public"] }],
          responses: { "200": { description: "Verified human yes/no and public handles" }, "401": { content: json(errorRef) }, "403": { content: json(errorRef) } },
        },
      },
      "/api/agent/links": {
        post: {
          summary: "Create a QR code / short link",
          security: [{ rout_oauth: ["assets:write"] }],
          requestBody: {
            content: json({ type: "object", required: ["target_url"], properties: { target_url: { type: "string", format: "uri" }, label: { type: "string" }, kind: { enum: ["qr", "link"] } } }),
          },
          responses: {
            "201": { description: "Created; returns short_url" },
            "402": { description: "Plan limit reached", content: json({ $ref: "#/components/schemas/PaymentRequired" }) },
            "429": { content: json(errorRef) },
          },
        },
      },
      "/api/agent/profile/draft": {
        post: {
          summary: "Prepare a profile draft (never publishes)",
          security: [{ rout_oauth: ["profile:draft"] }],
          requestBody: {
            content: json({
              type: "object",
              required: ["space"],
              properties: {
                space: { enum: ["alias", "verified"] },
                displayName: { type: "string" },
                tagline: { type: "string" },
                theme: { type: "string" },
                cardStyle: { type: "string" },
                blocks: { type: "array", items: { type: "object" } },
              },
            }),
          },
          responses: { "202": { description: "Draft saved; the member must publish", content: json({ $ref: "#/components/schemas/HumanActionRequired" }) } },
        },
      },
      "/api/badge/verify": {
        get: {
          summary: "Web badge check: verified human on a domain the member registered",
          parameters: [{ name: "username", in: "query", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Badge payload (verified, verified_human, origin_match)" } },
        },
      },
      "/{handle}": {
        get: {
          summary: "Public profile as JSON-LD (send Accept: application/json)",
          parameters: [{ name: "handle", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "schema.org ProfilePage" } },
        },
      },
    },
  };
}
