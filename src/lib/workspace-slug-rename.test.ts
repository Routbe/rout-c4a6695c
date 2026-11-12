import { describe, expect, it } from "vitest";
import { slugWithKeptSuffix } from "./workspace-rules";

describe("workspace username rename", () => {
  it("keeps the fixed 4-char suffix and replaces the chosen part", () => {
    expect(slugWithKeptSuffix("maximilien-6yak", "Studio Max")).toEqual({ slug: "studio-max-6yak" });
  });
  it("rejects a chosen part shorter than 3 characters", () => {
    expect("error" in slugWithKeptSuffix("acme-ab12", "ab")).toBe(true);
  });
});
