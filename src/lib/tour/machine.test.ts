import { describe, expect, it } from "vitest";
import { IDLE_STATE, tourReducer, type TourEvent, type TourState } from "./machine";
import { placeTooltip } from "./placement";
import { looksLikeUrl, tourForPath } from "./definitions";

const run = (events: TourEvent[], from: TourState = IDLE_STATE) => events.reduce(tourReducer, from);
const start: TourEvent = { type: "START", tourId: "agenda", total: 2 };

describe("tour state machine", () => {
  it("waits for a missing element instead of failing", () => {
    expect(run([start]).status).toBe("AWAITING_ELEMENT");
  });
  it("falls back to AWAITING_ELEMENT when the spotlighted node disappears", () => {
    expect(run([start, { type: "ELEMENT_FOUND" }, { type: "MOUNTED" }, { type: "ELEMENT_LOST" }]).status).toBe("AWAITING_ELEMENT");
  });
  it("aborts silently when the user navigates away", () => {
    expect(run([start, { type: "NAVIGATED_AWAY" }]).status).toBe("ABORTED");
  });
  it("completes after advancing past the last step", () => {
    const s = run([start, { type: "ELEMENT_FOUND" }, { type: "MOUNTED" }, { type: "ADVANCE" }, { type: "TRANSITION_DONE" }, { type: "ELEMENT_FOUND" }, { type: "MOUNTED" }, { type: "ADVANCE" }]);
    expect(s.status).toBe("COMPLETED");
  });
  it("ignores a double advance during a transition", () => {
    const s = run([start, { type: "ELEMENT_FOUND" }, { type: "MOUNTED" }, { type: "ADVANCE" }, { type: "ADVANCE" }]);
    expect(s.index).toBe(1);
  });
});

describe("tooltip placement", () => {
  const insets = { top: 47, right: 0, bottom: 34, left: 0 };
  it("flips above a target near the bottom safe area", () => {
    const p = placeTooltip({ top: 700, left: 20, width: 100, height: 40 }, { width: 300, height: 160 }, { width: 390, height: 844 }, insets);
    expect(p.side).toBe("top");
  });
  it("never places a tooltip under the notch", () => {
    const p = placeTooltip({ top: 0, left: 0, width: 390, height: 844 }, { width: 360, height: 400 }, { width: 390, height: 844 }, insets);
    expect(p.top).toBeGreaterThanOrEqual(insets.top + 12);
    expect(p.top + 400).toBeLessThanOrEqual(844 - insets.bottom - 12);
  });
});

describe("tour helpers", () => {
  it("accepts a pasted link and rejects plain words", () => {
    expect(looksLikeUrl("rout.be/about")).toBe(true);
    expect(looksLikeUrl("hallo")).toBe(false);
  });
  it("maps pages to their tour", () => {
    expect(tourForPath("/dashboard")).toBe("commandCenter");
    expect(tourForPath("/dashboard/assets")).toBeNull();
  });
});

import { TOURS as ALL_TOURS, tourForPath as forPath } from "./definitions";
import en from "@/locales/en.json";
import nl from "@/locales/nl.json";
import fr from "@/locales/fr.json";
import de from "@/locales/de.json";

describe("tour coverage", () => {
  it("routes /dashboard/identity to the identity tour", () => {
    expect(forPath("/dashboard/identity")).toBe("identity");
    expect(forPath("/dashboard")).toBe("commandCenter");
  });
  it("every step has a title and body in nl, en, fr and de", () => {
    for (const dict of [nl, en, fr, de] as unknown as Record<string, string>[]) {
      for (const tour of Object.values(ALL_TOURS)) {
        for (const s of tour.steps) {
          expect(dict[`tourEngine.${tour.id}.${s.id}.title`], `${tour.id}.${s.id}`).toBeTruthy();
          expect(dict[`tourEngine.${tour.id}.${s.id}.body`]).toBeTruthy();
        }
        expect(dict[`tourEngine.palette.${tour.id}`]).toBeTruthy();
      }
    }
  });
});
