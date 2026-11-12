import { describe, expect, it, vi } from "vitest";

const { sql } = vi.hoisted(() => {
  const tag = Object.assign(async () => [{ n: 50 }], { query: vi.fn(async () => []) });
  return { sql: tag };
});
vi.mock("@/lib/neon", () => ({ sql }));
vi.mock("@/lib/auth/middleware", () => ({ requireAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      middleware: () => chain,
      inputValidator: () => chain,
      handler: (fn: (a: unknown) => unknown) => fn,
    };
    return chain;
  },
}));
import { uploadGalleryMedia } from "./gallery-media.functions";

describe("gallery free photo limit", () => {
  it("refuses an upload once 50 free photos are stored", async () => {
    const run = uploadGalleryMedia as unknown as (a: unknown) => Promise<{ ok: boolean; message?: string }>;
    const res = await run({ data: { base64: "AAAA", contentType: "image/png", ext: "png" }, context: { userId: "u1" } });
    expect(res.ok).toBe(false);
    expect(sql.query).not.toHaveBeenCalled();
  });
});
