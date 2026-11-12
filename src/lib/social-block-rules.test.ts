import { describe, expect, it } from "vitest";
import { publicFollowerCount, socialHandleKey } from "./social-block-rules";
describe("social block followers", () => {
  it("requires verification and an explicit opt-in", () => {
    expect(publicFollowerCount(false, true, 42)).toBeNull();
    expect(publicFollowerCount(true, false, 42)).toBeNull();
    expect(publicFollowerCount(false, false, 42)).toBeNull();
    expect(publicFollowerCount(true, true, 42)).toBe(42);
  });
  it("matches handles case-insensitively", () => expect(socialHandleKey("@Example")).toBe(socialHandleKey("example")));
});
