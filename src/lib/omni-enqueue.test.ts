// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const query = vi.hoisted(() => vi.fn());
vi.mock("@/lib/neon", () => ({ sql: query }));
import { enqueueOmniJob, listOmniJobs } from "./omni-ingest.server";
beforeEach(() => { query.mockReset(); process.env.OMNI_RENDER_HOSTS = "example.com"; });
it("rejects unapproved hosts before any database write", async () => {
  await expect(enqueueOmniJob({ userId: "22222222-2222-4222-8222-222222222222", source: "studio", url: "https://169.254.169.254.nip.io/x" })).rejects.toThrow("host_not_allowed");
  expect(query).not.toHaveBeenCalled();
});
it("acknowledges only a persisted id without starting source processing", async () => {
  query.mockResolvedValueOnce([{ n: 0 }]).mockResolvedValueOnce([{ id: "11111111-1111-4111-8111-111111111111" }]);
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("source_fetch_forbidden"));
  try {
    expect(await enqueueOmniJob({ userId: "22222222-2222-4222-8222-222222222222", source: "studio", url: "https://example.com/article" })).toBe("11111111-1111-4111-8111-111111111111");
    expect(fetch).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(2);
  } finally { fetch.mockRestore(); }
});
it("a database failure never produces an accepted job id", async () => {
  query.mockResolvedValueOnce([{ n: 0 }]).mockRejectedValueOnce(new Error("database_unavailable"));
  await expect(enqueueOmniJob({ userId: "22222222-2222-4222-8222-222222222222", source: "studio", url: "https://example.com/article" })).rejects.toThrow("database_unavailable");
});
it("reading the inbox never resets jobs or schedules a worker", async () => {
  query.mockResolvedValueOnce([]);
  expect(await listOmniJobs("22222222-2222-4222-8222-222222222222")).toEqual([]);
  expect(query).toHaveBeenCalledTimes(1);
  const statement = (query.mock.calls[0]?.[0] as string[]).join("?");
  expect(statement.trim().toLowerCase().startsWith("select")).toBe(true);
});