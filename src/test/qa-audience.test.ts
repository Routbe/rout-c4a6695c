import { describe, expect, it } from "vitest";
import { canSendQuestion, stricterQaLevel } from "@/lib/minor-safety";
import { DEFAULT_DISPLAY_PREFS, parseDisplayPrefs } from "@/lib/profile-display";

describe("anonymous Q&A opt-in and audiences", () => {
  it("is off until explicitly enabled", () => {
    expect(DEFAULT_DISPLAY_PREFS.questionsEnabled).toBe(false);
    expect(parseDisplayPrefs({}).questionsEnabled).toBe(false);
    expect(parseDisplayPrefs({ questionsEnabled: true }).questionsEnabled).toBe(true);
  });
  it("requires membership by default", () => {
    expect(parseDisplayPrefs({}).qaAudience).toBe("members_only");
    expect(canSendQuestion("members_only", { signedIn: false, verified: false })).toBe(false);
    expect(canSendQuestion("members_only", { signedIn: true, verified: false })).toBe(true);
  });
  it("requires verified membership for verified-only questions", () => {
    expect(canSendQuestion("verified_only", { signedIn: true, verified: false })).toBe(false);
    expect(canSendQuestion("verified_only", { signedIn: true, verified: true })).toBe(true);
  });
  it("never weakens parental restrictions", () => {
    expect(stricterQaLevel("verified_only", "public_unrestricted")).toBe("verified_only");
    expect(stricterQaLevel("public_unrestricted", "members_only")).toBe("members_only");
    expect(stricterQaLevel("disabled", "public_unrestricted")).toBe("disabled");
  });
});