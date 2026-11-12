// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ neon: vi.fn(), transaction: vi.fn(), query: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ neon: mocks.neon }));
import { databaseTransport, runBatch, withDbContext } from "@/lib/neon";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("reads DATABASE_URL after import and preserves the atomic security prefix", async () => {
  vi.stubEnv("NEON_API_KEY", ""); vi.stubEnv("LOVABLE_API_KEY", "");
  vi.stubEnv("DATABASE_URL", "postgresql://runtime:secret@ep-test.neon.tech/db");
  mocks.query.mockImplementation((query, params) => ({ query, params }));
  mocks.transaction.mockResolvedValue(Array.from({ length: 4 }, (_, i) => ({ rows: i === 3 ? [{ ok: true }] : [], rowCount: 1, command: "SELECT" })));
  mocks.neon.mockReturnValue({ query: mocks.query, transaction: mocks.transaction });
  expect(databaseTransport()).toBe("direct");
  const result = await withDbContext({ userId: "11111111-1111-4111-8111-111111111111", workspaceId: null }, () => runBatch([{ query: "select true as ok", params: [] }]));
  expect(mocks.neon).toHaveBeenCalledWith("postgresql://runtime:secret@ep-test.neon.tech/db", { fullResults: true });
  expect(mocks.query.mock.calls[0]?.[0]).toBe("set local role rout_app");
  expect(mocks.query.mock.calls[1]?.[0]).toContain("set_config");
  expect(mocks.query.mock.calls[2]?.[0]).toContain("runtime_role_unsafe");
  expect(result[0]?.rows).toEqual([{ ok: true }]);
});
it("prefers the linked gateway when both credentials exist", () => {
  vi.stubEnv("NEON_API_KEY", "test"); vi.stubEnv("LOVABLE_API_KEY", "test");
  vi.stubEnv("DATABASE_URL", "postgresql://test.neon.tech/db");
  expect(databaseTransport()).toBe("gateway");
});