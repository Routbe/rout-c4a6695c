import { describe, expect, it } from "vitest";
import { QUESTION_MAX, QUESTION_RATE, normalizeText } from "./questions-rules";

describe("anonymous Q&A rules", () => {
  it("allows max 5 questions per IP per minute", () => {
    expect(QUESTION_RATE).toEqual({ limit: 5, windowSec: 60 });
  });
  it("rejects empty and too-long questions", () => {
    expect(normalizeText("   ", QUESTION_MAX)).toBeNull();
    expect(normalizeText("a".repeat(QUESTION_MAX + 1), QUESTION_MAX)).toBeNull();
    expect(normalizeText("  Hoi? ", QUESTION_MAX)).toBe("Hoi?");
  });
});
