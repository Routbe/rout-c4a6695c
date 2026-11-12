import { describe, expect, it } from "vitest";
import { bioEditorInput } from "./bio-validation";
describe("local bio editor input", () => {
  it("accepts exactly 1000 characters", () => {
    expect(bioEditorInput.safeParse({ text: "a".repeat(1000) }).success).toBe(true);
  });
  it("rejects more than 1000 characters, even whitespace padding", () => {
    expect(bioEditorInput.safeParse({ text: "a".repeat(1001) }).success).toBe(false);
    expect(bioEditorInput.safeParse({ text: " ".repeat(1000) + "a" }).success).toBe(false);
  });
  it("rejects empty input and invalid locales", () => {
    expect(bioEditorInput.safeParse({ text: "  " }).success).toBe(false);
    expect(bioEditorInput.safeParse({ text: "Hello", sourceLocale: "es" }).success).toBe(false);
  });
});
