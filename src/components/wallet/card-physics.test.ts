import { describe, expect, it } from "vitest";
import { CARD_DAMPING_RATIO, clampTilt, filterGyro, stepSpring, type Spring } from "./card-physics";

function run(dt: number, seconds: number) {
  let s: Spring = { x: 0, v: 0 };
  let peak = 0;
  for (let t = 0; t < seconds; t += dt) {
    s = stepSpring(s, 1, dt);
    peak = Math.max(peak, s.x);
  }
  return { s, peak };
}

describe("card physics", () => {
  it("clamps sensor and pointer inputs and rejects non-finite readings", () => {
    expect(clampTilt(20)).toBe(1);
    expect(clampTilt(-20)).toBe(-1);
    expect(clampTilt(0.3)).toBe(0.3);
    expect(clampTilt(NaN)).toBe(0);
    expect(clampTilt(Infinity)).toBe(0);
  });
  it("is under-damped: one soft overshoot, then it settles on target", () => {
    expect(CARD_DAMPING_RATIO).toBeLessThan(1);
    const { s, peak } = run(1 / 60, 3);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1.15);
    expect(Math.abs(s.x - 1)).toBeLessThan(0.01);
  });

  it("feels the same at 60 Hz and 120 Hz", () => {
    expect(Math.abs(run(1 / 60, 0.5).s.x - run(1 / 120, 0.5).s.x)).toBeLessThan(0.02);
  });

  it("has weight: it lags behind the hand at first", () => {
    expect(run(1 / 60, 0.1).s.x).toBeLessThan(0.5);
  });

  it("ignores gyro jitter inside the dead zone", () => {
    expect(filterGyro(0.2, 0.205, 1 / 60)).toBe(0.2);
    expect(filterGyro(0.2, 0.5, 1 / 60)).toBeGreaterThan(0.2);
  });
});

import { GYRO_REST_MS, MAX_TILT_RAD, TILT_LERP, lerpDamp, orientationToTilt, tiltTarget } from "./card-physics";

describe("tilt damping and limits", () => {
  it("limits tilt to 0.25 rad per axis", () => {
    expect(MAX_TILT_RAD).toBe(0.25);
  });
  it("recentres a still phone after 2 seconds", () => {
    expect(GYRO_REST_MS).toBe(2000);
    expect(tiltTarget(0.6, 1999, GYRO_REST_MS)).toBe(0.6);
    expect(tiltTarget(0.6, 2001, GYRO_REST_MS)).toBe(0);
    expect(tiltTarget(0.6, 1e9, Infinity)).toBe(0.6);
  });
  it("treats the calibrated pose as flat", () => {
    expect(orientationToTilt(60, 10, 0, { x: 10, y: 60 })).toEqual({ x: 0, y: 0 });
  });
  it("uses a damping factor between 0.05 and 0.1 per 60 Hz frame", () => {
    expect(TILT_LERP).toBeGreaterThanOrEqual(0.05);
    expect(TILT_LERP).toBeLessThanOrEqual(0.1);
    expect(lerpDamp(0, 1, 1 / 60)).toBeCloseTo(TILT_LERP, 6);
  });
  it("lags the same at 60 Hz and 120 Hz", () => {
    let a = 0, b = 0;
    for (let i = 0; i < 30; i++) a = lerpDamp(a, 1, 1 / 60);
    for (let i = 0; i < 60; i++) b = lerpDamp(b, 1, 1 / 120);
    expect(Math.abs(a - b)).toBeLessThan(1e-9);
  });
  it("clamps a wild phone rotation to the visible range", () => {
    const t = orientationToTilt(180, 90, 0);
    expect(t.x).toBe(1);
    expect(t.y).toBe(1);
  });
});

import { decaySpin as _decay, isBackFace as _isBack, nearestFace as _nearest, clampDragPitch as _clampP, MAX_DRAG_PITCH as _MP } from "./card-physics";
describe("grab spin", () => {
  it("snaps to the nearest face", () => {
    expect(_nearest(1.7)).toBeCloseTo(Math.PI);
    expect(_nearest(1.5)).toBeCloseTo(0);
    expect(_isBack(Math.PI)).toBe(true);
    expect(_isBack(-Math.PI)).toBe(true);
    expect(_isBack(2 * Math.PI)).toBe(false);
  });
  it("coasting decays and pitch is limited", () => {
    expect(_decay(10, 1)).toBeLessThan(0.5);
    expect(_clampP(2)).toBe(_MP);
  });
});

import { zoomFromWheel, zoomFromPinch, clampPan } from "./card-physics";
describe("card zoom", () => {
  it("wheel zooms by delta size and clamps 0..1", () => {
    expect(zoomFromWheel(0, -100)).toBeCloseTo(0.25);
    expect(zoomFromWheel(0.5, 10_000)).toBe(0);
    expect(zoomFromWheel(0.5, -10_000)).toBe(1);
    expect(zoomFromWheel(0, -10, 1)).toBeCloseTo(0.4);
  });
  it("pinch doubling spread adds 0.6", () => {
    expect(zoomFromPinch(0, 0.2, 100, 200)).toBeCloseTo(0.8);
  });
  it("pan centres at zero zoom", () => {
    expect(clampPan({ x: 0.7, y: -3 }, 0)).toEqual({ x: 0, y: 0 });
    expect(clampPan({ x: 0.7, y: -3 }, 0.5)).toEqual({ x: 0.7, y: -1 });
  });
});
