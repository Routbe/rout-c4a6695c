import { describe, expect, it } from "vitest";
import { confirmInstancePage, isTrustedConfirmOrigin, mayRedirectDirectly } from "./mastodon-start-rules";

const approved = (h: string) => h === "rout.be" || h.endsWith(".rout.be");

describe("mastodon start open-redirect guard", () => {
  it("redirects directly for known servers and same-origin starts only", () => {
    expect(mayRedirectDirectly("mastodon.social", "cross-site")).toBe(true);
    expect(mayRedirectDirectly("evil.example", "same-origin")).toBe(true);
    expect(mayRedirectDirectly("evil.example", "cross-site")).toBe(false);
    expect(mayRedirectDirectly("evil.example", "same-site")).toBe(false);
    expect(mayRedirectDirectly("evil.example", "none")).toBe(false);
    expect(mayRedirectDirectly("evil.example", null)).toBe(false);
  });

  it("accepts confirmations only from ROUT origins", () => {
    expect(isTrustedConfirmOrigin("https://rout.be", "rout.be", approved)).toBe(true);
    expect(isTrustedConfirmOrigin("https://preview.example", "preview.example", approved)).toBe(true);
    expect(isTrustedConfirmOrigin("https://evil.example", "rout.be", approved)).toBe(false);
    expect(isTrustedConfirmOrigin(null, "rout.be", approved)).toBe(false);
    expect(isTrustedConfirmOrigin("null", "rout.be", approved)).toBe(false);
    expect(isTrustedConfirmOrigin("not a url", "rout.be", approved)).toBe(false);
  });

  it("names the server and escapes form values", () => {
    const html = confirmInstancePage({ instance: "my.server", next: '/x"><script>', link: true, dutch: true });
    expect(html).toContain("<strong>my.server</strong>");
    expect(html).not.toContain("<script>");
    expect(html).toContain('method="post"');
  });
});
