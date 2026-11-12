import { describe, expect, it } from "vitest";
import { featureForPath, scopedPath } from "./scope-routes";

describe("scope routes", () => {
  it("builds personal and workspace addresses", () => {
    expect(scopedPath(null, "dev-console")).toBe("/studio/personal/dev-console");
    expect(scopedPath("acme-corp", "dev-console")).toBe("/studio/w/acme-corp/dev-console");
  });
  it("keeps the current feature when switching scope", () => {
    expect(featureForPath("/console/apps")).toBe("dev-console");
    expect(featureForPath("/studio/w/acme/booking")).toBe("booking");
    expect(featureForPath("/studio")).toBe("studio");
  });
});
