import { afterEach, describe, expect, it, vi } from "vitest";
import { spatialHaptic } from "./spatial-haptics";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("spatial haptics", () => {
  it("uses a 12ms micro-pulse", () => {
    const vibrate = vi.fn(); vi.stubGlobal("navigator", { vibrate });
    spatialHaptic(); expect(vibrate).toHaveBeenCalledWith(12);
  });
  it("never interrupts actions when vibration is unavailable", () => {
    vi.stubGlobal("navigator", {}); expect(() => spatialHaptic()).not.toThrow();
  });
  it("respects reduced motion", () => {
    const vibrate = vi.fn(); vi.stubGlobal("navigator", { vibrate });
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
    spatialHaptic(); expect(vibrate).not.toHaveBeenCalled();
  });
});