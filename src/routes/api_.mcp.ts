import { createFileRoute } from "@tanstack/react-router";
import {
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_INFO,
  findTool,
  isRpcRequest,
  listTools,
  rpcError,
  rpcResult,
  sandboxRequestParts,
  toolResultFromAgent,
  type JsonRpcRequest,
  type McpTool,
} from "@/lib/mcp-server/protocol";

/**
 * POST /api/mcp — ROUT's remote MCP server (JSON-RPC 2.0, Streamable HTTP).
 * `initialize`, `ping` and `tools/list` are public; `tools/call` on a write
 * tool needs a human-delegated ROUT OAuth access token with the tool's agent
 * scope. Write tools run through the existing /api/agent/* handlers, which
 * verify the token, enforce quotas, log to Chronos and return 202
 * `human_action_required` with a signed /act link when a human must step in.
 */
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...extra },
  });

/** Copy only client-IP headers that are present: an empty value would put every MCP caller in one rate-limit bucket. */
function forwardedIpHeaders(request: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"]) {
    const v = request.headers.get(h)?.trim();
    if (v) out[h] = v;
  }
  return out;
}

type Handler = (ctx: { request: Request }) => Promise<Response>;

async function agentHandler(path: string): Promise<Handler | null> {
  const mod =
    path === "/api/agent/links"
      ? await import("./api_.agent.links")
      : path === "/api/agent/profile/draft"
        ? await import("./api_.agent.profile.draft")
        : path === "/api/agent/workspaces"
          ? await import("./api_.agent.workspaces")
          : null;
  const server = (mod?.Route.options as { server?: { handlers?: { POST?: Handler } } } | undefined)?.server;
  return server?.handlers?.POST ?? null;
}

const SANDBOX_ROUTES: Record<string, () => Promise<{ Route: { options: unknown } }>> = {
  "/api/agent/sandbox": () => import("./api_.agent.sandbox"),
  "/api/agent/sandbox/workspace": () => import("./api_.agent.sandbox_.workspace"),
  "/api/agent/sandbox/profile": () => import("./api_.agent.sandbox_.profile"),
  "/api/agent/sandbox/apps": () => import("./api_.agent.sandbox_.apps"),
  "/api/v1/pow/challenge": () => import("./api_.v1.pow.challenge"),
};

async function callSandbox(tool: McpTool, args: Record<string, unknown>, request: Request) {
  const spec = tool.sandbox!;
  const load = SANDBOX_ROUTES[spec.path];
  const mod = load ? await load() : null;
  const handlers = (mod?.Route.options as { server?: { handlers?: Record<string, Handler> } } | undefined)?.server?.handlers;
  const handler = handlers?.[spec.method];
  if (!handler) return toolResultFromAgent(503, { error: "server_error", message: "Sandbox handler unavailable." });
  const { headers, body, path } = sandboxRequestParts(tool, args);
  const inner = new Request(new URL(path, request.url), {
    method: spec.method,
    headers: {
      "content-type": "application/json",
      ...forwardedIpHeaders(request),
      "x-rout-via": "mcp",
      ...headers,
    },
    body: spec.method === "GET" ? undefined : JSON.stringify(body),
  });
  const res = await handler({ request: inner });
  const out = await res.json().catch(() => ({}));
  return toolResultFromAgent(res.status, out);
}

async function readProfile(args: Record<string, unknown>, origin: string) {
  const kind = args["kind"];
  const handle = String(args["handle"] ?? "").trim().toLowerCase().replace(/^@+/, "");
  if (!/^[a-z0-9._-]{2,48}$/.test(handle) || !["verified", "alias", "workspace"].includes(String(kind))) {
    return toolResultFromAgent(400, { error: "invalid_request", message: "kind must be verified|alias|workspace and handle 2–48 characters." });
  }
  if (kind === "workspace") {
    const { getPublicWorkspace } = await import("@/lib/workspace-public.functions");
    const ws = await getPublicWorkspace({ data: { slug: handle } }).catch(() => null);
    if (!ws) return toolResultFromAgent(404, { error: "not_found", message: "No public workspace with this slug." });
    return toolResultFromAgent(200, {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: ws.name,
      url: `${origin}/w/${ws.slug}`,
      description: ws.studio?.tagline || ws.description || null,
      logo: ws.avatarUrl,
      sameAs: ws.domainVerified && ws.domain ? [`https://${ws.domain}`] : [],
    });
  }
  const { machineProfile } = await import("@/lib/agent/profile-json.server");
  const profile = await machineProfile({ space: kind as "verified" | "alias", handle }, origin).catch(() => null);
  if (!profile) return toolResultFromAgent(404, { error: "not_found", message: "No public profile with this handle." });
  return toolResultFromAgent(200, profile);
}

async function handle(msg: JsonRpcRequest, request: Request) {
  const id = msg.id ?? null;
  switch (msg.method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: MCP_SERVER_INFO,
        instructions:
          "ROUT (rout.be): link-in-bio profile hubs, social links for website footers, dynamic QR/short links and Login with ROUT for developers. No account? Build a whole workspace yourself: rout_sandbox_challenge → solve → rout_sandbox_register → rout_pow_challenge(scope=workspace) → rout_sandbox_create_workspace → rout_sandbox_design_profile (links, socials) → optional rout_sandbox_set_login_apps. Give your human the claim code: they sign in at rout.be and enter it under workspace settings → Claim. OAuth tools (rout_generate_qr, rout_create_draft, rout_provision_workspace) need a ROUT OAuth token and never publish; when a tool returns human_action_required, show its action_url.",
      });
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: listTools() });
    case "tools/call": {
      const params = msg.params ?? {};
      const tool = findTool(params["name"]);
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${String(params["name"])}`);
      const args = (params["arguments"] && typeof params["arguments"] === "object" ? params["arguments"] : {}) as Record<string, unknown>;
      const { publicOrigin } = await import("@/lib/agent/agent-auth.server");
      const origin = publicOrigin(request);
      if (tool.sandbox) return rpcResult(id, await callSandbox(tool, args, request));
      if (!tool.agentPath) return rpcResult(id, await readProfile(args, origin));
      const handler = await agentHandler(tool.agentPath);
      if (!handler) return rpcError(id, -32603, "Tool handler unavailable.");
      const inner = new Request(new URL(tool.agentPath, request.url), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: request.headers.get("authorization") ?? "",
          ...forwardedIpHeaders(request),
          "x-rout-via": "mcp",
        },
        body: JSON.stringify(args),
      });
      const res = await handler({ request: inner });
      const body = await res.json().catch(() => ({}));
      return rpcResult(id, toolResultFromAgent(res.status, body));
    }
    default:
      return rpcError(id, -32601, `Method not found: ${msg.method}`);
  }
}

export const Route = createFileRoute("/api_/mcp")({
  server: {
    handlers: {
      GET: async () =>
        json({ error: "method_not_allowed", message: "POST JSON-RPC 2.0 messages to this endpoint. Server-initiated streams are not offered." }, 405, { allow: "POST" }),
      POST: async ({ request }) => {
        const body = await request.json().catch(() => undefined);
        if (body === undefined) return json(rpcError(null, -32700, "Parse error"), 400);
        const batch = Array.isArray(body) ? body : [body];
        if (batch.length === 0 || batch.length > 20) return json(rpcError(null, -32600, "Invalid request"), 400);

        // Write calls without any bearer token: refuse at the HTTP level so MCP clients start OAuth.
        const needsAuth = batch.some((m) => isRpcRequest(m) && m.method === "tools/call" && findTool(m.params?.["name"])?.scope);
        if (needsAuth && !/^Bearer\s+\S+/i.test(request.headers.get("authorization") ?? "")) {
          const { publicOrigin } = await import("@/lib/agent/agent-auth.server");
          return json(
            { error: "invalid_token", message: "Send a ROUT OAuth access token with agent scopes as `Authorization: Bearer <token>`." },
            401,
            { "www-authenticate": `Bearer realm="rout", resource_metadata="${publicOrigin(request)}/.well-known/openid-configuration"` },
          );
        }

        const out: unknown[] = [];
        for (const m of batch) {
          if (!isRpcRequest(m)) {
            out.push(rpcError(null, -32600, "Invalid request"));
            continue;
          }
          if (m.id === undefined) continue; // notification (e.g. notifications/initialized)
          try {
            out.push(await handle(m, request));
          } catch (error) {
            console.error("[mcp]", error);
            out.push(rpcError(m.id ?? null, -32603, "Internal error"));
          }
        }
        if (out.length === 0) return new Response(null, { status: 202 });
        return json(Array.isArray(body) ? out : out[0], 200, { "mcp-protocol-version": MCP_PROTOCOL_VERSION });
      },
    },
  },
});
