import { describe, expect, it } from "vitest";
import { allowedHandlesFor, normalizeDomain } from "./admin-grant-rules";

describe("admin grant verification rules", () => {
  it("influencer exceptions allow only the typed names", () => {
    const r = allowedHandlesFor({ tier: "influencer", firstName: "Jan", lastName: "Smet", exceptions: ["djmax"] });
    expect(r.ok && r.handles).toContain("djmax");
    expect(r.ok && r.handles).toContain("jansmet");
    expect(r.ok && r.handles).not.toContain("djmax2");
  });

  it("pro refuses exceptions and only offers real-name usernames", () => {
    expect(allowedHandlesFor({ tier: "pro", firstName: "Jan", lastName: "Smet", exceptions: ["djmax"] }).ok).toBe(false);
    const r = allowedHandlesFor({ tier: "pro", firstName: "Jan", lastName: "Smet" });
    expect(r.ok && r.handles.every((h) => h.includes("jan") && h.includes("smet"))).toBe(true);
  });

  it("pro and influencer require first and last name", () => {
    expect(allowedHandlesFor({ tier: "pro", firstName: "Jan", lastName: "" }).ok).toBe(false);
  });

  it("business requires a valid domain", () => {
    expect(allowedHandlesFor({ tier: "business", domain: "localhost" }).ok).toBe(false);
    expect(allowedHandlesFor({ tier: "business", domain: "192.168.1.1" }).ok).toBe(false);
    expect(normalizeDomain("https://www.bakkerij.be/contact")).toBe("bakkerij.be");
    const r = allowedHandlesFor({ tier: "business", domain: "bakkerij.be" });
    expect(r.ok && r.handles).toEqual(["bakkerij"]);
  });
});
