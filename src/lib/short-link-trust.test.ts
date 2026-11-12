import { describe, expect, it } from "vitest";
import { isTrustedLinkOwner } from "./short-link-trust";

const now = new Date("2026-10-31T00:00:00Z");
const base = { tier1RealHuman: false, tier2LegalIdentity: false, verified: false, emailVerified: false, accountCreatedAt: new Date("2026-01-01") };

describe("short-link trust", () => {
  it("tier 1 redirects directly", () => expect(isTrustedLinkOwner({ ...base, tier1RealHuman: true }, now)).toBe(true));
  it("tier 2 redirects directly", () => expect(isTrustedLinkOwner({ ...base, tier2LegalIdentity: true }, now)).toBe(true));
  it("email alone never skips confirmation", () => expect(isTrustedLinkOwner({ ...base, emailVerified: true }, now)).toBe(false));
  it("legacy verification alone never skips confirmation", () => expect(isTrustedLinkOwner({ ...base, verified: true }, now)).toBe(false));
  it("confirmed email on a brand-new account shows the warning", () =>
    expect(isTrustedLinkOwner({ ...base, emailVerified: true, accountCreatedAt: new Date("2026-10-29") }, now)).toBe(false));
  it("unconfirmed accounts show the warning", () => expect(isTrustedLinkOwner(base, now)).toBe(false));
  it("unknown owner shows the warning", () => expect(isTrustedLinkOwner(null, now)).toBe(false));
});
