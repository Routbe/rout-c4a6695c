import { describe, expect, it } from "vitest";
import { workspacePublicPath } from "./workspace-rules";

describe("workspacePublicPath", () => {
  it("uses /w/ for a workspace without a verified domain", () => {
    expect(workspacePublicPath("delplanche-group-hwy7", null)).toBe("/w/delplanche-group-hwy7");
    expect(workspacePublicPath("delplanche-group-hwy7", { name: "delplanche.cloud", verified: false })).toBe("/w/delplanche-group-hwy7");
  });
  it("uses the verified domain instead of /w/", () => {
    expect(workspacePublicPath("delplanche-group-hwy7", { name: "Delplanche.cloud", verified: true })).toBe("/delplanche.cloud");
  });
  it("never produces a /u/ path", () => {
    expect(workspacePublicPath("x-abcd", null).startsWith("/u/")).toBe(false);
  });
});
