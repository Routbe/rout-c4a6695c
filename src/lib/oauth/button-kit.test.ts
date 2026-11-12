import { describe, expect, it } from "vitest";
import { ROUT_BUTTON_LABELS, routButtonSnippet } from "./button-kit";

describe("ROUT button kit", () => {
  it("offers login, connect and verify with their own handler", () => {
    expect(ROUT_BUTTON_LABELS.verify).toBe("Verifiëren met ROUT");
    expect(routButtonSnippet("verify")).toContain('action="/auth/rout/verify"');
    expect(routButtonSnippet("connect")).toContain("Verbinden met ROUT");
  });
});
