import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/neon", () => ({ sql: vi.fn() }));
import { snapchatRedirectUri, snapchatAuthorizeUrl } from "./snapchat.server";

describe("snapchat redirect uri", () => {
  it("is always the registered rout.be callback, even from a preview host", () => {
    const req = new Request("https://id-preview--x.lovable.app/api/snapchat/start");
    expect(snapchatRedirectUri(req)).toBe("https://rout.be/api/public/snapchat/callback");
  });
  it("authorize URL carries that exact redirect_uri", () => {
    process.env["SNAPCHAT_CLIENT_ID"] = "id";
    process.env["SNAPCHAT_CLIENT_SECRET"] = "secret";
    const u = new URL(snapchatAuthorizeUrl("u1", "https://admin.example.com"));
    expect(u.searchParams.get("redirect_uri")).toBe("https://rout.be/api/public/snapchat/callback");
  });
});
