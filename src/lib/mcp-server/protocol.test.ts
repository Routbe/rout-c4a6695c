import { describe, expect, it } from "vitest";
import { MCP_TOOLS, findTool, listTools, sandboxRequestParts, toolResultFromAgent } from "./protocol";

describe("ROUT MCP protocol", () => {
  it("lists the OAuth tools and the account-less sandbox tools", () => {
    expect(listTools().map((t) => t.name)).toEqual([
      "rout_read_profile", "rout_generate_qr", "rout_create_draft", "rout_provision_workspace",
      "rout_sandbox_challenge", "rout_sandbox_register", "rout_pow_challenge",
      "rout_sandbox_create_workspace", "rout_sandbox_design_profile", "rout_sandbox_set_login_apps", "rout_sandbox_status",
    ]);
  });
  it("sandbox tools need no OAuth and move the key and proof-of-work into headers", () => {
    const t = findTool("rout_sandbox_create_workspace")!;
    expect(t.scope).toBeNull();
    const parts = sandboxRequestParts(t, { sandbox_key: "rsk_x", pow_challenge: "c", pow_solution: "s", name: "Acme", slug: "acme" });
    expect(parts.headers).toEqual({ authorization: "Bearer rsk_x", "x-rout-pow-challenge": "c", "x-rout-pow-solution": "s" });
    expect(parts.body).toEqual({ name: "Acme", slug: "acme" });
  });
  it("pow challenge scope goes in the query string", () => {
    expect(sandboxRequestParts(findTool("rout_pow_challenge")!, { scope: "workspace" }).path).toBe("/api/v1/pow/challenge?scope=workspace");
  });
  it("write tools require their agent scopes", () => {
    expect(findTool("rout_generate_qr")?.scope).toBe("assets:write");
    expect(findTool("rout_create_draft")?.scope).toBe("profile:draft");
    expect(findTool("rout_provision_workspace")?.scope).toBe("assets:write");
    expect(findTool("rout_read_profile")?.scope).toBeNull();
  });
  it("every write tool delegates to an audited agent handler", () => {
    for (const t of MCP_TOOLS) if (t.scope) expect(t.agentPath).toMatch(/^\/api\/agent\//);
  });
  it("human_action_required (202) is not an error; 403 is", () => {
    expect(toolResultFromAgent(202, { status: "human_action_required" }).isError).toBe(false);
    expect(toolResultFromAgent(403, { error: "insufficient_scope" }).isError).toBe(true);
  });
});
