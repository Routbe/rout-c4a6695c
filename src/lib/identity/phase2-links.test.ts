import { describe, expect, it } from "vitest";
import { createRevokeToken, verifyRevokeToken } from "./link-token";
import { linksBackTo } from "./relme-rules";

const ID = "3f1c2b9e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";

describe("identity revoke token", () => {
  it("accepts its own token", async () => {
    const t = await createRevokeToken("s".repeat(32), ID);
    expect(await verifyRevokeToken("s".repeat(32), t)).toBe(ID);
  });
  it("rejects a token signed with another secret", async () => {
    const t = await createRevokeToken("a".repeat(32), ID);
    expect(await verifyRevokeToken("b".repeat(32), t)).toBeNull();
  });
  it("rejects a token moved to another link id", async () => {
    const t = await createRevokeToken("s".repeat(32), ID);
    const forged = t.replace(ID, "00000000-0000-4000-8000-000000000000");
    expect(await verifyRevokeToken("s".repeat(32), forged)).toBeNull();
  });
});

describe("rel=me proof", () => {
  const targets = ["https://rout.be/jona"];
  it("accepts a rel=me link back to the ROUT page", () => {
    expect(linksBackTo('<a rel="me noopener" href="https://rout.be/jona/">ROUT</a>', targets)).toBe(true);
  });
  it("rejects a plain link without rel=me", () => {
    expect(linksBackTo('<a href="https://rout.be/jona">ROUT</a>', targets)).toBe(false);
  });
  it("rejects rel=me to another handle", () => {
    expect(linksBackTo('<link rel="me" href="https://rout.be/jonathan">', targets)).toBe(false);
  });
});
