import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ cache: vi.fn(), validate: vi.fn(), body: vi.fn() }));
vi.mock("@/lib/integrations/mastodon.server", () => ({ cachedRemoteImage: mocks.cache, limitedImageBody: mocks.body }));
vi.mock("@/lib/security/ssrf-guard.server", () => ({ validateOutboundUrl: mocks.validate }));
import { readPublicImage } from "@/lib/public-image.server";
describe("optional public image caching", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });
  it("serves photos when persistent storage is unavailable without redirecting the visitor", async () => {
    mocks.cache.mockResolvedValue(new Response("Unavailable", { status: 503 }));
    mocks.validate.mockResolvedValue("https://lh3.googleusercontent.com/photo");
    mocks.body.mockResolvedValue(new Uint8Array([1, 2, 3]));
    const fetch = vi.fn().mockResolvedValue(new Response("photo", { headers: { "content-type": "image/png" } })); vi.stubGlobal("fetch", fetch);
    const response = await readPublicImage("https://lh3.googleusercontent.com/photo");
    expect(response.status).toBe(200); expect(response.headers.get("location")).toBeNull(); expect(response.headers.get("content-type")).toBe("image/png");
    expect(mocks.validate).toHaveBeenCalled(); expect(fetch.mock.calls[0]?.[1].redirect).toBe("error");
  });
  it("never bypasses SSRF rejection during fallback", async () => {
    mocks.cache.mockResolvedValue(new Response("Unavailable", { status: 503 })); mocks.validate.mockRejectedValue(new Error("Unsafe host"));
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(readPublicImage("https://internal.example/photo")).rejects.toThrow("Unsafe host"); expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps hard size and type refusals", async () => {
    mocks.cache.mockRejectedValue(Object.assign(new Error("Too large"), { status: 413 }));
    await expect(readPublicImage("https://lh3.googleusercontent.com/photo")).rejects.toMatchObject({ status: 413 }); expect(mocks.validate).not.toHaveBeenCalled();
  });
});