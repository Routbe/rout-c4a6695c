/**
 * ROUT MCP server (`/api/mcp`) — pure, browser-safe protocol layer.
 * JSON-RPC 2.0 over Streamable HTTP (single JSON responses). Write tools
 * delegate to the existing `/api/agent/*` handlers, so scope checks, quotas,
 * Chronos audit and `human_action_required` stay in one place.
 */
export const MCP_PROTOCOL_VERSION = "2025-06-18";
export const MCP_SERVER_INFO = { name: "rout", title: "ROUT", version: "1.0.0" } as const;

export type JsonRpcId = string | number | null;
export type JsonRpcRequest = { jsonrpc: "2.0"; id?: JsonRpcId; method: string; params?: Record<string, unknown> };

export type McpTool = {
  name: string;
  title: string;
  description: string;
  /** Agent scope the token must carry; null = public read. */
  scope: "assets:write" | "profile:draft" | null;
  /** Existing agent handler the call is delegated to (write tools). */
  agentPath: "/api/agent/links" | "/api/agent/profile/draft" | "/api/agent/workspaces" | null;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, boolean>;
  /**
   * Account-less sandbox tools: delegated to the existing /api/agent/sandbox*
   * and /api/v1/pow handlers. `sandbox_key` / `pow_*` arguments become the
   * Authorization and proof-of-work headers those handlers already require.
   */
  sandbox?: { method: "GET" | "POST" | "PATCH" | "PUT"; path: string; query?: string[] };
};

const SANDBOX_KEY = { type: "string", pattern: "^rsk_[0-9a-f]{64}$", description: "The rsk_… key from rout_sandbox_register." };
const POW = {
  pow_challenge: { type: "string", description: "Challenge from rout_pow_challenge (scope=workspace)." },
  pow_solution: { type: "string", description: "Solution so sha256(challenge + \":\" + solution) has difficulty_bits leading zero bits." },
};
const BLOCK = {
  type: "object",
  properties: {
    id: { type: "string", pattern: "^[a-zA-Z0-9_-]{1,40}$" },
    kind: { type: "string", enum: ["link", "text", "heading", "divider", "contact", "social"] },
    label: { type: "string", maxLength: 120 },
    value: { type: "string", maxLength: 500, description: "URL for link/social blocks, text otherwise." },
    style: { type: "object" },
  },
  required: ["id", "kind"],
  additionalProperties: false,
};

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

export const MCP_TOOLS: readonly McpTool[] = [
  {
    name: "rout_read_profile",
    title: "Read a public ROUT profile",
    description: "Returns the public JSON-LD of a profile (rout.be/<handle>), privacy alias (rout.be/u/<handle>) or workspace (rout.be/w/<slug>).",
    scope: null,
    agentPath: null,
    inputSchema: obj({
      kind: { type: "string", enum: ["verified", "alias", "workspace"], description: "Which namespace the handle lives in." },
      handle: { type: "string", minLength: 2, maxLength: 48, description: "Handle or workspace slug, without @." },
    }, ["kind", "handle"]),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "rout_generate_qr",
    title: "Generate a QR code or short link",
    description: "Creates a tracked QR code or short link for the signed-in member, within their plan limits. Requires the assets:write scope.",
    scope: "assets:write",
    agentPath: "/api/agent/links",
    inputSchema: obj({
      target_url: { type: "string", format: "uri", maxLength: 2000, description: "http(s) destination." },
      label: { type: "string", maxLength: 120 },
      kind: { type: "string", enum: ["qr", "link"] },
    }, ["target_url"]),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "rout_create_draft",
    title: "Prepare a Studio draft",
    description: "Prepares an unpublished profile draft in the Studio. Publishing always stays a human action. Requires the profile:draft scope.",
    scope: "profile:draft",
    agentPath: "/api/agent/profile/draft",
    inputSchema: obj({
      space: { type: "string", enum: ["alias", "verified"] },
      displayName: { type: "string", maxLength: 120 },
      tagline: { type: "string", maxLength: 240 },
      theme: { type: "string", maxLength: 40 },
      cardStyle: { type: "string", maxLength: 40 },
      blocks: { type: "array", maxItems: 100, items: { type: "object" } },
    }, ["space"]),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "rout_provision_workspace",
    title: "Provision a 24-hour staging workspace",
    description: "Creates an unowned staging workspace and returns a single-use claim URL for the human. No e-mail is sent; unclaimed workspaces are deleted after 24 hours. Requires the assets:write scope.",
    scope: "assets:write",
    agentPath: "/api/agent/workspaces",
    inputSchema: obj({
      name: { type: "string", minLength: 1, maxLength: 120 },
      slug: { type: "string", minLength: 3, maxLength: 48, description: "Lowercase letters, digits and single hyphens." },
      description: { type: "string", maxLength: 500 },
    }, ["name", "slug"]),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  // --- Account-less sandbox: an agent builds a whole workspace with no human login ---
  {
    name: "rout_sandbox_challenge",
    title: "Start a sandbox (step 1: proof-of-work challenge)",
    description: "No account needed. Returns a proof-of-work challenge. Solve it (sha256 with leading zero bits) and call rout_sandbox_register.",
    scope: null, agentPath: null,
    sandbox: { method: "GET", path: "/api/agent/sandbox" },
    inputSchema: obj({}),
    annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "rout_sandbox_register",
    title: "Register a sandbox (step 2: get a sandbox key)",
    description: "Exchanges a solved challenge for a 24-hour sandbox key (rsk_…), shown once. The key reaches only the one workspace you create.",
    scope: null, agentPath: null,
    sandbox: { method: "POST", path: "/api/agent/sandbox" },
    inputSchema: obj({
      challenge: { type: "string" },
      solution: { type: "string", pattern: "^[0-9a-zA-Z]{1,64}$" },
      agent_name: { type: "string", minLength: 1, maxLength: 80, description: "Your name, e.g. \"Claude\"." },
    }, ["challenge", "solution", "agent_name"]),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "rout_pow_challenge",
    title: "Get a proof-of-work challenge for a heavy operation",
    description: "Single-use challenge required before rout_sandbox_create_workspace (scope=workspace).",
    scope: null, agentPath: null,
    sandbox: { method: "GET", path: "/api/v1/pow/challenge", query: ["scope"] },
    inputSchema: obj({ scope: { type: "string", enum: ["workspace", "vault"] } }, ["scope"]),
    annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "rout_sandbox_create_workspace",
    title: "Create the workspace (step 3)",
    description: "Creates the sandbox's one unowned workspace (rout.be/w/<slug>) and returns, once, the claim code, claim link and QR code to give your human. They sign in or sign up at rout.be and enter the code (profile menu → workspace settings → Claim). Unclaimed workspaces are deleted after 24 hours.",
    scope: null, agentPath: null,
    sandbox: { method: "POST", path: "/api/agent/sandbox/workspace" },
    inputSchema: obj({
      sandbox_key: SANDBOX_KEY, ...POW,
      name: { type: "string", minLength: 1, maxLength: 120 },
      slug: { type: "string", minLength: 3, maxLength: 48, description: "Lowercase letters, digits and single hyphens." },
      description: { type: "string", maxLength: 500 },
    }, ["sandbox_key", "pow_challenge", "pow_solution", "name", "slug"]),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "rout_sandbox_design_profile",
    title: "Design the link-in-bio profile hub (step 4)",
    description: "Sets the workspace's Studio draft: name, tagline, theme, card style and blocks (links, socials, contact, text). The owner sees exactly this after claiming; publishing stays a human action.",
    scope: null, agentPath: null,
    sandbox: { method: "PATCH", path: "/api/agent/sandbox/profile" },
    inputSchema: obj({
      sandbox_key: SANDBOX_KEY,
      displayName: { type: "string", maxLength: 120 },
      tagline: { type: "string", maxLength: 240 },
      theme: { type: "string", pattern: "^[a-z0-9-]{1,40}$" },
      cardStyle: { type: "string", pattern: "^[a-z0-9-]{1,40}$" },
      blocks: { type: "array", maxItems: 50, items: BLOCK },
      displayPrefs: { type: "object" },
    }, ["sandbox_key"]),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "rout_sandbox_set_login_apps",
    title: "Prepare \"Login with ROUT\" apps",
    description: "Replaces up to 3 Login-with-ROUT OAuth app specs for the website you are building. They become real clients owned by the human after the claim.",
    scope: null, agentPath: null,
    sandbox: { method: "PUT", path: "/api/agent/sandbox/apps" },
    inputSchema: obj({
      sandbox_key: SANDBOX_KEY,
      apps: {
        type: "array", maxItems: 3,
        items: {
          type: "object",
          properties: {
            name: { type: "string", maxLength: 80 },
            description: { type: "string", maxLength: 500 },
            homepage_url: { type: "string" }, privacy_url: { type: "string" }, terms_url: { type: "string" },
            redirect_uris: { type: "array", minItems: 1, maxItems: 10, items: { type: "string" } },
            scopes: { type: "array", items: { type: "string", enum: ["openid", "profile", "email"] } },
          },
          required: ["name", "redirect_uris"],
          additionalProperties: false,
        },
      },
    }, ["sandbox_key", "apps"]),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "rout_sandbox_status",
    title: "Read the sandbox workspace",
    description: "Current draft, revision, login-app specs and claim state of the sandbox workspace.",
    scope: null, agentPath: null,
    sandbox: { method: "GET", path: "/api/agent/sandbox/workspace" },
    inputSchema: obj({ sandbox_key: SANDBOX_KEY }, ["sandbox_key"]),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
];

/** Split MCP arguments into headers and the JSON body/query for a sandbox handler. */
export function sandboxRequestParts(tool: McpTool, args: Record<string, unknown>) {
  const { sandbox_key, pow_challenge, pow_solution, ...rest } = args;
  const headers: Record<string, string> = {};
  if (typeof sandbox_key === "string") headers["authorization"] = `Bearer ${sandbox_key}`;
  if (typeof pow_challenge === "string") headers["x-rout-pow-challenge"] = pow_challenge;
  if (typeof pow_solution === "string") headers["x-rout-pow-solution"] = pow_solution;
  const query = new URLSearchParams();
  for (const k of tool.sandbox?.query ?? []) {
    if (rest[k] !== undefined) query.set(k, String(rest[k]));
    delete rest[k];
  }
  const qs = query.toString();
  return { headers, body: rest, path: `${tool.sandbox?.path ?? ""}${qs ? `?${qs}` : ""}` };
}

export function findTool(name: unknown): McpTool | null {
  return MCP_TOOLS.find((t) => t.name === name) ?? null;
}

/** tools/list payload (no internal routing fields). */
export function listTools() {
  return MCP_TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations }));
}

export function rpcResult(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

export function rpcError(id: JsonRpcId, code: number, message: string, data?: unknown) {
  return { jsonrpc: "2.0" as const, id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

export function isRpcRequest(v: unknown): v is JsonRpcRequest {
  return !!v && typeof v === "object" && (v as { jsonrpc?: unknown }).jsonrpc === "2.0" && typeof (v as { method?: unknown }).method === "string";
}

/**
 * Agent handler response → MCP tool result. 202 `human_action_required` is a
 * successful, structured answer (the agent shows `action_url` to its human);
 * 4xx/5xx become `isError` results carrying the ROUT error body.
 */
export function toolResultFromAgent(status: number, body: unknown) {
  const structured = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : { value: body };
  return {
    content: [{ type: "text", text: JSON.stringify(structured) }],
    structuredContent: { ...structured, http_status: status },
    isError: status >= 400,
  };
}
