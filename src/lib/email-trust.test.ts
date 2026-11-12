import { describe, expect, it } from "vitest";
import { emailTrust } from "./email-trust";

describe("emailTrust", () => {
  it("proton.me vouched by Proton is sovereign", () => {
    expect(emailTrust({ email: "a@proton.me", emailVerified: true, verifiedBy: ["proton"] })).toBe("sovereign");
  });
  it("ik.me vouched by Infomaniak is sovereign", () => {
    expect(emailTrust({ email: "a@ik.me", emailVerified: true, verifiedBy: ["infomaniak"] })).toBe("sovereign");
  });
  it("gmail vouched by Google is provider-verified", () => {
    expect(emailTrust({ email: "a@gmail.com", emailVerified: true, verifiedBy: ["google"] })).toBe("provider");
  });
  it("custom domain vouched by GitHub gets no trusted badge without DNS proof", () => {
    expect(emailTrust({ email: "a@old-domain.be", emailVerified: true, verifiedBy: ["github"] })).toBe("verified");
  });
  it("custom domain with DNS proof is domain-verified", () => {
    expect(emailTrust({ email: "a@old-domain.be", emailVerified: true, verifiedBy: [], domainProven: true })).toBe("domain");
  });
  it("proton.me without a Proton link is not sovereign", () => {
    expect(emailTrust({ email: "a@proton.me", emailVerified: true, verifiedBy: [] })).toBe("verified");
  });
});
