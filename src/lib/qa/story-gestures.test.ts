import { expect, it } from "vitest";
import { storyGesture } from "./story-gestures";
import { activeStories } from "./story";

it("closes on downward swipes but not horizontal or upward swipes", () => {
  expect(storyGesture(10, 90)).toBe("close");
  expect(storyGesture(90, 10)).toBe("drag");
  expect(storyGesture(0, -90)).toBe("drag");
  expect(storyGesture(2, 3)).toBe("tap");
});
it("removes a story at its exact 24-hour expiry", () => {
  const answer = { id: "one", body: "Question", answer: "Answer", prompt: null, answeredAt: "2026-11-03T00:00:00Z", storyUntil: "2026-11-04T00:00:00Z" };
  expect(activeStories([answer], Date.parse("2026-11-03T23:59:59Z"))).toHaveLength(1);
  expect(activeStories([answer], Date.parse("2026-11-04T00:00:00Z"))).toHaveLength(0);
});