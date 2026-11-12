import { describe, expect, it } from "vitest";
import { parseDuolingo } from "./duolingo-rules";

describe("parseDuolingo", () => {
  it("reads streak, total XP and the active course", () => {
    const r = parseDuolingo({
      users: [{ username: "ana", streak: 14, totalXp: 12340, learningLanguage: "es",
        courses: [{ learningLanguage: "fr", title: "French" }, { learningLanguage: "es", title: "Spanish" }] }],
    });
    expect(r).toEqual({ username: "ana", streak: 14, language: "es", languageName: "Spaans", totalXp: 12340 });
  });
  it("falls back to the first course when no learningLanguage is set", () => {
    expect(parseDuolingo({ users: [{ username: "b", streak: 3, courses: [{ learningLanguage: "de" }] }] })?.languageName).toBe("Duits");
  });
  it("returns null for an empty or broken answer", () => {
    expect(parseDuolingo({ users: [] })).toBeNull();
    expect(parseDuolingo(null)).toBeNull();
    expect(parseDuolingo({ users: [{ streak: 5 }] })).toBeNull();
  });
});
