// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ sql: vi.fn(), enqueue: vi.fn() }));
vi.mock("@/lib/neon", () => ({ sql: mocks.sql, withDbContext: (_context: unknown, action: () => unknown) => action() }));
vi.mock("@/lib/api-guard.server", () => ({ guardRequest: () => null }));
vi.mock("@/lib/omni-ingest.server", () => ({ sha256Hex: async () => "hashed", enqueueOmniJob: mocks.enqueue }));
import { handleIngestWebhook, readIngestToken } from "./omni-ingest-route.server";
const token = "11111111-1111-4111-8111-111111111111";
beforeEach(() => { mocks.sql.mockReset(); mocks.enqueue.mockReset(); });
it("UUID header authentication queues hints and returns 202 without downloading", async () => {
  mocks.sql.mockResolvedValue([{ id: token }]); mocks.enqueue.mockResolvedValue("job-id");
  const sourceFetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("not_allowed"));
  try {
    const response = await handleIngestWebhook(new Request("https://rout.be/api/public/ingest/grid", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ media_url: "https://cdn.example.com/image.jpg", target_url: "https://example.com/story", title: "Story" }) }));
    expect(response.status).toBe(202); expect(await response.json()).toEqual({ job_id: "job-id", status: "queued" });
    expect(mocks.enqueue).toHaveBeenCalledWith({ userId: token, source: "webhook", url: "https://example.com/story", title: "Story", mediaUrl: "https://cdn.example.com/image.jpg" });
    expect(sourceFetch).not.toHaveBeenCalled();
  } finally { sourceFetch.mockRestore(); }
});
it("rejects unauthenticated webhooks without creating a job", async () => {
  expect((await handleIngestWebhook(new Request("https://rout.be/api/public/ingest/grid", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }))).status).toBe(401);
  expect(mocks.enqueue).not.toHaveBeenCalled();
});
it("supports header and query tokens, including existing legacy tokens", () => {
  expect(readIngestToken(new Request(`https://rout.be/api/public/ingest/omni?token=${token}`))).toBe(token);
  const old = `rout_ing_${"a".repeat(64)}`;
  expect(readIngestToken(new Request("https://rout.be/api/public/ingest/omni", { headers: { "x-rout-ingest-token": old } }))).toBe(old);
});