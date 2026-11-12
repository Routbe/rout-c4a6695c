import { describe, expect, it } from "vitest";
import { EXPLICIT_ACCOUNT_LINKING, freshIdentityStepUp, mastodonSubject, normalizeIdentityIssuer, ownsAuthIdentity } from "./link-rules";

describe("explicit identity ownership", () => {
  it("disables implicit verified-email linking while preserving explicit linking", () => {
    expect(EXPLICIT_ACCOUNT_LINKING.disableImplicitLinking).toBe(true);
    expect(EXPLICIT_ACCOUNT_LINKING.enabled).toBe(true);
  });
  it("never accepts a different mapped auth identity", () => {
    expect(ownsAuthIdentity("local", "owner", "attacker")).toBe(false);
    expect(ownsAuthIdentity("owner", null, "owner")).toBe(true);
    expect(ownsAuthIdentity("local", "owner", "owner")).toBe(true);
  });
  it("requires an allowed proof at most five minutes old and never from the future", () => {
    expect(freshIdentityStepUp("passkey", 0, 300000)).toBe(true);
    expect(freshIdentityStepUp("totp", 0, 300001)).toBe(false);
    expect(freshIdentityStepUp("email_code", 1, 0)).toBe(false);
    expect(freshIdentityStepUp("signup", 0, 0)).toBe(false);
  });
  it("normalizes issuer and separates Mastodon account IDs across instances", () => {
    expect(normalizeIdentityIssuer("https://SOCIAL.example/")).toBe("https://social.example");
    expect(mastodonSubject("https://a.example", "42")).not.toBe(mastodonSubject("https://b.example", "42"));
    expect(() => mastodonSubject("https://a.example", "mutable-handle")).toThrow();
    expect(() => normalizeIdentityIssuer("https://user:pass@a.example")).toThrow();
  });
});