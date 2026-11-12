// @vitest-environment node
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { pairwiseSubject, redirectSector } from "./subject";

describe("pairwise OIDC subject", () => {
  const secret = "01234567890123456789012345678901";
  it("uses the required HMAC-SHA256 formula and base64url", async () => {
    expect(await pairwiseSubject(secret, "rp.example", "user-42")).toBe(createHmac("sha256", secret).update("rp.exampleuser-42").digest("base64url"));
  });
  it("is stable for a sector but uncorrelatable between hosts", async () => {
    const first = await pairwiseSubject(secret, "one.example", "user-42");
    expect(await pairwiseSubject(secret, "one.example", "user-42")).toBe(first);
    expect(await pairwiseSubject(secret, "two.example", "user-42")).not.toBe(first);
    expect(await pairwiseSubject(secret, "one.example", "user-43")).not.toBe(first);
  });
  it("derives sectors from the redirect host, not its path", () => {
    expect(redirectSector("https://RP.example/callback")).toBe("rp.example");
    expect(redirectSector("https://rp.example/other")).toBe("rp.example");
  });
  it("fails closed without a sufficiently strong secret", async () => {
    await expect(pairwiseSubject("short", "rp.example", "user")).rejects.toThrow();
  });
});