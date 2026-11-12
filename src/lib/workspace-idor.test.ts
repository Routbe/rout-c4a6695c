import { describe, expect, it } from "vitest";
import { canManageTeam, canUseDeveloperTools, checkWorkspaceDelete, checkWorkspaceRename } from "./workspace-rules";

describe("workspace IDOR guards", () => {
  it("only owner/admin/developer reach developer tools inside a workspace", () => {
    expect(canUseDeveloperTools("owner")).toBe(true);
    expect(canUseDeveloperTools("admin")).toBe(true);
    expect(canUseDeveloperTools("developer")).toBe(true);
    expect(canUseDeveloperTools("editor" as never)).toBe(false);
  });
  it("non-members (no role) cannot manage a workspace", () => {
    expect(canManageTeam(null)).toBe(false);
    expect(checkWorkspaceRename(null, "Acme")).not.toBeNull();
    expect(checkWorkspaceDelete(null, "Acme", "Acme")).not.toBeNull();
  });
  it("developers cannot rename or delete a workspace", () => {
    expect(checkWorkspaceRename("developer" as never, "Acme")).not.toBeNull();
    expect(checkWorkspaceDelete("admin", "Acme", "Acme")).not.toBeNull();
    expect(checkWorkspaceDelete("owner", "Acme", "Acme")).toBeNull();
  });
});
