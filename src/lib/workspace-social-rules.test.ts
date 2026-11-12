import { describe, expect, it } from "vitest";
import { bioProvesWorkspace } from "./workspace-social-rules";

describe("workspace social proof", () => {
  it("accepts the workspace address", () => {
    expect(bioProvesWorkspace("Wij zijn op rout.be/w/acme-x1", "acme-x1", null)).toBe(true);
  });
  it("accepts the verified domain", () => {
    expect(bioProvesWorkspace("Site: acme.be", "acme-x1", "acme.be")).toBe(true);
  });
  it("rejects a domain that is not verified", () => {
    expect(bioProvesWorkspace("Site: acme.be", "acme-x1", null)).toBe(false);
  });
  it("rejects another workspace", () => {
    expect(bioProvesWorkspace("rout.be/w/other", "acme-x1", null)).toBe(false);
  });
});
