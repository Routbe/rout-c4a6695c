import { describe, expect, it } from "vitest";
import { isCustomDomainHost, rootRedirectTarget, validRootRedirectUrl } from "./root-redirect";

describe("custom domain root redirect", () => {
  it("profile_hub goes to the owner's profile", () => {
    expect(rootRedirectTarget({ type: "profile_hub", url: null, profileHandle: "jan" })).toBe("https://rout.be/jan");
  });
  it("profile_hub without an active profile falls back to rout.be", () => {
    expect(rootRedirectTarget({ type: "profile_hub", url: null, profileHandle: null })).toBe("https://rout.be");
  });
  it("custom_url goes to the saved https URL", () => {
    expect(rootRedirectTarget({ type: "custom_url", url: "https://example.com/x", profileHandle: "jan" })).toBe("https://example.com/x");
  });
  it("custom_url refuses http, credentials and localhost", () => {
    expect(validRootRedirectUrl("http://example.com")).toBeNull();
    expect(validRootRedirectUrl("https://a:b@example.com")).toBeNull();
    expect(validRootRedirectUrl("https://localhost/")).toBeNull();
    expect(validRootRedirectUrl("https://10.0.0.1/")).toBeNull();
  });
  it("rout_main goes to rout.be and none renders normally", () => {
    expect(rootRedirectTarget({ type: "rout_main", url: null, profileHandle: "jan" })).toBe("https://rout.be");
    expect(rootRedirectTarget({ type: "none", url: null, profileHandle: "jan" })).toBeNull();
  });
  it("only foreign hosts count as custom domains", () => {
    expect(isCustomDomainHost("jdelplanche.dlp.li")).toBe(true);
    expect(isCustomDomainHost("rout.be")).toBe(false);
    expect(isCustomDomainHost("x.lovable.app")).toBe(false);
    expect(isCustomDomainHost("localhost:8080")).toBe(false);
  });
});
