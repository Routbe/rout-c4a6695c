import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ publicMode: vi.fn(), sql: vi.fn() }));
vi.mock("@/lib/app-mode", () => ({ isPublicMode: mocks.publicMode }));
vi.mock("@/lib/neon", () => ({ sql: mocks.sql }));
vi.mock("@/lib/brevo/client", () => ({ sendVerificationApproved: vi.fn(), sendVerificationRejected: vi.fn() }));
import { assertAdminPermission } from "@/lib/admin-access.server";
import { assertVipConsoleRole } from "@/lib/admin.server";

describe("administrative RPC deployment boundary", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it("public deployment refuses delegated permissions before any database query", async () => {
    mocks.publicMode.mockReturnValue(true);
    await expect(assertAdminPermission("admin", "manage_admins")).rejects.toThrow("forbidden");
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("public deployment refuses VIP administration before any database query", async () => {
    mocks.publicMode.mockReturnValue(true);
    await expect(assertVipConsoleRole("admin")).rejects.toThrow("Forbidden");
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("admin deployment retains the existing database role check", async () => {
    mocks.publicMode.mockReturnValue(false); mocks.sql.mockResolvedValue([]);
    await expect(assertAdminPermission("member", "manage_admins")).rejects.toThrow("forbidden");
    expect(mocks.sql).toHaveBeenCalled();
  });
});