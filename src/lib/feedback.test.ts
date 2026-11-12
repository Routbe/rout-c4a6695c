import { describe, expect, it } from "vitest";
import { feedbackFormSchema, feedbackResponseSchema, feedbackPath, feedbackScopeMatches, validFeedbackAnswer } from "./feedback";

describe("feedback rules", () => {
  it("creates a five-star form with profile display enabled", () => {
    expect(feedbackFormSchema.parse({ title: "Workshop", profileSpace: "alias", profileHandle: "maker42" })).toMatchObject({ type: "stars_5", showOnProfile: true, fullPage: false });
  });
  it("permits anonymous responses without requiring a name", () => {
    expect(feedbackResponseSchema.parse({ formId: "12345678-1234-4234-8234-123456789abc", rating: 5 })).toMatchObject({ reviewerName: "", allowFeatured: false });
  });
  it("limits stars to integers from 1 to 5", () => {
    expect([0, 1, 5, 6, 2.5].map(v => validFeedbackAnswer("stars_5", v, ""))).toEqual([false, true, true, false, false]);
  });
  it("allows NPS zero through ten", () => {
    expect([-1, 0, 10, 11].map(v => validFeedbackAnswer("nps_10", v, ""))).toEqual([false, true, true, false]);
  });
  it("limits emoji to the three choices", () => {
    expect([0, 1, 3, 4].map(v => validFeedbackAnswer("emoji_3", v, ""))).toEqual([false, true, true, false]);
  });
  it("requires written reviews to contain a comment and no invented rating", () => {
    expect(validFeedbackAnswer("text_review", null, "Goed!")).toBe(true);
    expect(validFeedbackAnswer("text_review", null, "  ")).toBe(false);
    expect(validFeedbackAnswer("text_review", 5, "Goed!")).toBe(false);
  });
  it("isolates personal ownership and active workspace", () => {
    expect(feedbackScopeMatches("alice", null, "bob", null)).toBe(false);
    expect(feedbackScopeMatches("alice", "one", "alice", "two")).toBe(false);
    expect(feedbackScopeMatches("alice", "one", "alice", null)).toBe(false);
    expect(feedbackScopeMatches("alice", "one", "bob", "one")).toBe(true);
  });
  it("encodes slugs without allowing path injection", () => {
    expect(feedbackPath("form/../admin")).toBe("/feedback/form%2F..%2Fadmin");
  });
});