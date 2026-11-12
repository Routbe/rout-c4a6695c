/**
 * Headless tour state machine. Pure and deterministic: the React host only
 * feeds it DOM facts (element found/lost, user action, navigation) and renders
 * whatever state comes out. No DOM access lives here.
 */
export type TourStatus =
  | "IDLE"
  | "AWAITING_ELEMENT"
  | "MOUNTING_SPOTLIGHT"
  | "LISTENING_FOR_EVENT"
  | "TRANSITIONING"
  | "ABORTED"
  | "COMPLETED";

export interface TourState {
  status: TourStatus;
  tourId: string | null;
  index: number;
  total: number;
}

export type TourEvent =
  | { type: "START"; tourId: string; total: number }
  | { type: "ELEMENT_FOUND" }
  | { type: "ELEMENT_LOST" }
  | { type: "MOUNTED" }
  | { type: "ADVANCE" }
  | { type: "BACK" }
  | { type: "TRANSITION_DONE" }
  | { type: "SKIP" }
  | { type: "NAVIGATED_AWAY" }
  | { type: "RESET" };

export const IDLE_STATE: TourState = { status: "IDLE", tourId: null, index: 0, total: 0 };

const RUNNING: ReadonlySet<TourStatus> = new Set([
  "AWAITING_ELEMENT",
  "MOUNTING_SPOTLIGHT",
  "LISTENING_FOR_EVENT",
  "TRANSITIONING",
]);

export function isRunning(state: TourState): boolean {
  return RUNNING.has(state.status);
}

/** Unknown or out-of-order events leave the state untouched — never throw. */
export function tourReducer(state: TourState, event: TourEvent): TourState {
  switch (event.type) {
    case "START":
      if (event.total <= 0) return state;
      return { status: "AWAITING_ELEMENT", tourId: event.tourId, index: 0, total: event.total };
    case "RESET":
      return IDLE_STATE;
    case "SKIP":
    case "NAVIGATED_AWAY":
      return isRunning(state) ? { ...state, status: "ABORTED" } : state;
    case "ELEMENT_FOUND":
      return state.status === "AWAITING_ELEMENT" ? { ...state, status: "MOUNTING_SPOTLIGHT" } : state;
    case "MOUNTED":
      return state.status === "MOUNTING_SPOTLIGHT" ? { ...state, status: "LISTENING_FOR_EVENT" } : state;
    case "ELEMENT_LOST":
      return state.status === "MOUNTING_SPOTLIGHT" || state.status === "LISTENING_FOR_EVENT"
        ? { ...state, status: "AWAITING_ELEMENT" }
        : state;
    case "ADVANCE":
      if (!isRunning(state) || state.status === "TRANSITIONING") return state;
      if (state.index >= state.total - 1) return { ...state, status: "COMPLETED" };
      return { ...state, status: "TRANSITIONING", index: state.index + 1 };
    case "BACK":
      if (!isRunning(state) || state.index === 0) return state;
      return { ...state, status: "TRANSITIONING", index: state.index - 1 };
    case "TRANSITION_DONE":
      return state.status === "TRANSITIONING" ? { ...state, status: "AWAITING_ELEMENT" } : state;
    default:
      return state;
  }
}
