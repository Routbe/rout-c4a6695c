import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/session.server", () => ({ currentUser: vi.fn(async () => null) }));

describe("wallet endpoints require a session", () => {
  it("refuses anonymous callers with Unauthorized before any wallet logic", async () => {
    const { requireAuth } = await import("@/lib/auth/middleware");
    const server = (requireAuth as unknown as { options: { server: (a: unknown) => Promise<unknown> } }).options.server;
    const next = vi.fn();
    await expect(server({ next, context: {}, data: { userId: "forged-other-user" } })).rejects.toThrow("Unauthorized");
    await expect(server({ next, context: {}, data: {} })).rejects.toMatchObject({ statusCode: 401 });
    expect(next).not.toHaveBeenCalled();
  });
});
