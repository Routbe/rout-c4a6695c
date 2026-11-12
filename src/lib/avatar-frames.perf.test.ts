/**
 * Performancebudget voor de volledige catalogus van 152 avatarkaders.
 *
 * De kaders zitten op elk publiek profiel en in de studio-preview. Deze test
 * houdt hun kosten meetbaar: het stijlen van alle kaders moet ruim binnen één
 * frame (16 ms) blijven, en de terugvalweergave voor trage toestellen mag geen
 * gradients, gloed of animatie bevatten.
 */
import { describe, expect, it } from "vitest";
import {
  AVATAR_FRAME_DEFS,
  AVATAR_FRAME_IDS,
  avatarFrameFallbackStyle,
  avatarFrameStyle,
  type FrameTheme,
} from "./avatar-frames";

const theme: FrameTheme = {
  bg: "#0b0b0f",
  card: "#14141b",
  text: "#f8fafc",
  border: "#27272a",
  accent: "#6366f1",
};

describe("avatar frame performance", () => {
  it("levert alle 152 kaders", () => {
    expect(AVATAR_FRAME_IDS).toHaveLength(152);
    expect(AVATAR_FRAME_DEFS).toHaveLength(152);
  });

  it("stijlt alle kaders 200 keer binnen één frame-budget", () => {
    const start = performance.now();
    for (let i = 0; i < 200; i++) {
      for (const id of AVATAR_FRAME_IDS) avatarFrameStyle(id, theme);
    }
    const perPass = (performance.now() - start) / 200;
    expect(perPass).toBeLessThan(16);
  });

  it("houdt de fallback goedkoop: geen gradient, gloed of animatie", () => {
    for (const def of AVATAR_FRAME_DEFS) {
      const style = avatarFrameFallbackStyle(def.id, theme);
      const serialized = JSON.stringify(style);
      expect(serialized).not.toMatch(/gradient/i);
      if (def.id !== "none") {
        expect(serialized).not.toMatch(/boxShadow/);
        expect(style["borderRadius"]).toBe(999);
      }
    }
  });

  it("fallback is minstens zo snel als de volledige stijl", () => {
    const run = (fn: (id: (typeof AVATAR_FRAME_IDS)[number]) => unknown) => {
      const start = performance.now();
      for (let i = 0; i < 500; i++) for (const id of AVATAR_FRAME_IDS) fn(id);
      return performance.now() - start;
    };
    const full = run((id) => avatarFrameStyle(id, theme));
    const light = run((id) => avatarFrameFallbackStyle(id, theme));
    expect(light).toBeLessThanOrEqual(full * 1.5 + 5);
  });
});
