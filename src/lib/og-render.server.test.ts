import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchImageAsDataUri, isFontBuffer } from "./og-render.server";

afterEach(() => vi.unstubAllGlobals());

describe("profile preview embedded avatars", () => {
  it("rejects HTML fallback responses masquerading as fonts", () => {
    expect(isFontBuffer(new TextEncoder().encode("<!DOCTYPE html><html>ROUT</html>"))).toBe(false);
    expect(isFontBuffer(new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(true);
  });
  it("embeds Google avatar bytes fetched through the first-party privacy proxy", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetcher);
    const avatar = "https://lh3.googleusercontent.com/a/member=s96-c";
    expect(await fetchImageAsDataUri(avatar, "https://rout.be")).toBe("data:image/png;base64,AQID");
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(`https://rout.be/api/public/proxy-image?url=${encodeURIComponent(avatar)}`);
  });

  it("never fetches an untrusted avatar host", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(await fetchImageAsDataUri("https://tracker.example/avatar.png", "https://rout.be")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("retains uploaded first-party photo bytes for both preview formats", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(new Uint8Array([4, 5, 6]), { headers: { "content-type": "image/webp" } }));
    vi.stubGlobal("fetch", fetcher);
    const path = "/api/public/avatar?path=12345678-1234-1234-1234-123456789abc%2Favatar-1729770000.webp";
    expect(await fetchImageAsDataUri(path, "https://rout.be")).toBe("data:image/webp;base64,BAUG");
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(`https://rout.be${path}`);
  });
});