import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/auth.functions", () => ({ getSessionUser: mocks.session }));
vi.mock("@/lib/admin.functions", () => ({ amIAdmin: mocks.admin }));
import { controlAccess } from "@/lib/admin-control-access";
describe("control center route access", () => {
  beforeEach(() => vi.resetAllMocks());
  it("refuses anonymous visitors before requesting admin data", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(controlAccess({ location: { href: "/admin/finance" } })).rejects.toBeDefined();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("refuses a signed-in member without an admin role", async () => {
    mocks.session.mockResolvedValue({ id: "member" });
    mocks.admin.mockResolvedValue({ isAdmin: false });
    await expect(controlAccess({ location: { href: "/admin/infra" } })).rejects.toThrow("alleen voor beheerders");
  });
  it("allows an authenticated admin", async () => {
    mocks.session.mockResolvedValue({ id: "admin" });
    mocks.admin.mockResolvedValue({ isAdmin: true });
    await expect(controlAccess({ location: { href: "/admin" } })).resolves.toBeUndefined();
  });
});