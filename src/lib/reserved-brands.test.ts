import { describe, expect, it } from "vitest";
import { isReservedName } from "./reserved-brands";
import { isReservedHandle } from "./profile";
import { isValidWorkspaceSlug, matrixWorkspaceSlug, randomSlugSuffix } from "./workspace-rules";

describe("brand protection", () => {
  it("blocks protected brands regardless of case or separators", () => {
    expect(isReservedName("Google")).toEqual({ reserved: true, reason: "Beschermd merk" });
    expect(isReservedName("g-o_o.gle").reserved).toBe(true);
  });
  it("allows ordinary names", () => {
    expect(isReservedName("delplanche").reserved).toBe(false);
  });
  it("applies to handles and workspace slugs alike", () => {
    expect(isReservedHandle("kbc")).toBe(true);
    expect(isValidWorkspaceSlug("kbc")).toBe(false);
  });
});

describe("namespace matrix", () => {
  it("free workspaces get a 4-character random suffix", () => {
    expect(matrixWorkspaceSlug("Bedrijf", "free", "x7k9")).toBe("bedrijf-x7k9");
    expect(randomSlugSuffix()).toMatch(/^[a-z0-9]{4}$/);
  });
  it("plus and pro keep the clean slug", () => {
    expect(matrixWorkspaceSlug("Bedrijf", "plus")).toBe("bedrijf");
    expect(matrixWorkspaceSlug("Bedrijf", "pro")).toBe("bedrijf");
  });
  it("a brand name never becomes a clean slug", () => {
    expect(matrixWorkspaceSlug("Google", "pro")).toBe("google-team");
  });
});
