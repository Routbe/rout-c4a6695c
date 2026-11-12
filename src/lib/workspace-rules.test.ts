import { describe, expect, it } from "vitest";
import { canEditWorkspaceHub, canManageTeam, canUseDeveloperTools, checkMemberChange, parseInviteTarget, slugify } from "./workspace-rules";

describe("workspace rules", () => {
  it("editors cannot open the developer console; owner/admin/developer can", () => {
    expect(canUseDeveloperTools("editor")).toBe(false);
    expect(canUseDeveloperTools("developer")).toBe(true);
    expect(canUseDeveloperTools("admin")).toBe(true);
    expect(canUseDeveloperTools("owner")).toBe(true);
  });

  it("only owners and admins manage the team", () => {
    expect(canManageTeam("developer")).toBe(false);
    expect(canManageTeam("editor")).toBe(false);
    expect(canManageTeam("admin")).toBe(true);
  });

  it("the last owner cannot be removed or demoted", () => {
    expect(checkMemberChange("owner", { kind: "remove", targetRole: "owner" }, 1)).not.toBeNull();
    expect(checkMemberChange("owner", { kind: "role", targetRole: "owner", nextRole: "admin" }, 1)).not.toBeNull();
    expect(checkMemberChange("owner", { kind: "remove", targetRole: "owner" }, 2)).toBeNull();
  });

  it("an admin cannot promote someone to owner", () => {
    expect(checkMemberChange("admin", { kind: "role", targetRole: "editor", nextRole: "owner" }, 1)).not.toBeNull();
    expect(checkMemberChange("admin", { kind: "role", targetRole: "editor", nextRole: "developer" }, 1)).toBeNull();
  });

  it("slugify makes url-safe names", () => {
    expect(slugify("Café Één BV")).toBe("cafe-een-bv");
  });
});

import { isValidWorkspaceSlug, workspaceSlug } from "./workspace-rules";
describe("workspace address rout.be/w/<name>", () => {
  it("accepts a brand name without digits", () => expect(isValidWorkspaceSlug("nike")).toBe(true));
  it("accepts 3 characters", () => expect(isValidWorkspaceSlug("abc")).toBe(true));
  it("rejects slugs shorter than 3", () => expect(isValidWorkspaceSlug("ab")).toBe(false));
  it("rejects uppercase and other symbols", () => expect(isValidWorkspaceSlug("Acme_Corp")).toBe(false));
  it("rejects reserved words", () => {
    for (const w of ["admin", "api", "auth", "u", "w", "studio", "settings", "rout"]) expect(isValidWorkspaceSlug(w)).toBe(false);
  });
  it("builds the slug from the name", () => expect(workspaceSlug("Acme Corp")).toBe("acme-corp"));
  it("adds a suffix when taken", () => expect(workspaceSlug("Acme Corp", 1)).toBe("acme-corp-2"));
  it("never builds a reserved slug", () => expect(isValidWorkspaceSlug(workspaceSlug("Studio"))).toBe(true));

  it("owners, admins and editors edit the workspace hub; developers and viewers do not", () => {
    expect(canEditWorkspaceHub("owner")).toBe(true);
    expect(canEditWorkspaceHub("admin")).toBe(true);
    expect(canEditWorkspaceHub("editor")).toBe(true);
    expect(canEditWorkspaceHub("developer")).toBe(false);
    expect(canEditWorkspaceHub("viewer")).toBe(false);
    expect(canEditWorkspaceHub(null)).toBe(false);
  });

  it("invites read e-mail addresses and @usernames", () => {
    expect(parseInviteTarget(" Naam@Bedrijf.be ")).toEqual({ kind: "email", value: "naam@bedrijf.be" });
    expect(parseInviteTarget("@Lisa")).toEqual({ kind: "username", value: "lisa" });
    expect(parseInviteTarget("lisa.b")).toEqual({ kind: "username", value: "lisa.b" });
    expect(parseInviteTarget("@a")).toBeNull();
    expect(parseInviteTarget("twee woorden")).toBeNull();
  });
});
