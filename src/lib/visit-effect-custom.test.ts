import { describe, expect, it } from "vitest";
import { normalizeVisitCustom } from "./visit-effect-custom";

describe("custom visit effect", () => {
  it("keeps at most 4 emojis and drops letters", () => {
    const c = normalizeVisitCustom({ emojis: ["🎉", "abc", "💖", "🔥", "⭐", "🌸"] });
    expect(c.emojis).toEqual(["🎉", "💖", "🔥", "⭐"]);
  });
  it("clamps duration to 1–10 s and amount to 5–80", () => {
    const c = normalizeVisitCustom({ duration: 99, amount: 1 });
    expect(c.duration).toBe(10);
    expect(c.amount).toBe(5);
  });
  it("rejects unknown floor behaviour", () => {
    expect(normalizeVisitCustom({ floor: "explode" }).floor).toBe("through");
    expect(normalizeVisitCustom({ floor: "bounce" }).floor).toBe("bounce");
  });
  it("is off unless explicitly enabled", () => {
    expect(normalizeVisitCustom({}).enabled).toBe(false);
  });
});
