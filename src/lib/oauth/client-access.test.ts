import { describe, expect, it } from "vitest";
import { APP_ADMIN_ROLES, canManageClient } from "./client-access";

const ws = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const teamApp = { ownerUserId: "creator", workspaceId: ws };

describe("canManageClient", () => {
  it("lets a developer who did not create the app edit a workspace app", () =>
    expect(canManageClient(teamApp, { userId: "dev", workspaceId: ws }, "developer")).toBe(true));
  it("lets a workspace admin edit a workspace app", () =>
    expect(canManageClient(teamApp, { userId: "admin", workspaceId: ws }, "admin")).toBe(true));
  it("blocks an editor", () =>
    expect(canManageClient(teamApp, { userId: "ed", workspaceId: ws }, "editor")).toBe(false));
  it("blocks a viewer", () =>
    expect(canManageClient(teamApp, { userId: "v", workspaceId: ws }, "viewer")).toBe(false));
  it("blocks the creator once they are no longer a member", () =>
    expect(canManageClient(teamApp, { userId: "creator", workspaceId: ws }, null)).toBe(false));
  it("blocks a developer working in another workspace", () =>
    expect(canManageClient(teamApp, { userId: "dev", workspaceId: other }, "developer")).toBe(false));
  it("keeps personal apps with their creator", () => {
    const personal = { ownerUserId: "me", workspaceId: null };
    expect(canManageClient(personal, { userId: "me", workspaceId: null }, null)).toBe(true);
    expect(canManageClient(personal, { userId: "someone", workspaceId: null }, null)).toBe(false);
  });
  it("reserves the pairwise switch for owners and admins", () => {
    expect(canManageClient(teamApp, { userId: "dev", workspaceId: ws }, "developer", APP_ADMIN_ROLES)).toBe(false);
    expect(canManageClient(teamApp, { userId: "o", workspaceId: ws }, "owner", APP_ADMIN_ROLES)).toBe(true);
  });
});
