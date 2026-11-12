import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/neon", () => ({ sql: vi.fn(() => Promise.reject(new Error("unavailable"))) }));
import { hitRateLimit } from "./rate-limit-db.server";
afterEach(() => vi.restoreAllMocks());
it("refuses Q&A and rewrite requests when the shared counter is unavailable", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(await hitRateLimit("question-ask", "test", { limit: 5, windowSec: 60 }, { failClosed: true })).toEqual({ ok: false, retryAfter: 60 });
  expect(await hitRateLimit("qa-rewrite", "test", { limit: 3, windowSec: 60 }, { failClosed: true })).toEqual({ ok: false, retryAfter: 60 });
});