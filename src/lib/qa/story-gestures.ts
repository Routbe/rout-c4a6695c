/** A deliberate downward swipe closes; horizontal drags never become taps. */
export function storyGesture(dx: number, dy: number): "close" | "drag" | "tap" {
  if (dy >= 80 && dy > Math.abs(dx) * 1.4) return "close";
  return Math.hypot(dx, dy) > 16 ? "drag" : "tap";
}