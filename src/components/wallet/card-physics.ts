/**
 * Mass-spring-damper for the ROUT Card's tilt, tuned to feel like a 30 g
 * titanium card: it lags behind the hand, overshoots a hair and settles —
 * never jitters. Pure, no three.js or React, so it can be unit tested.
 */
export const CARD_MASS = 0.03; // kg
export const CARD_STIFFNESS = 1.15; // N·m/rad, pull toward the target angle
/** Damping ratio < 1 gives one soft overshoot; 0.78 reads as "heavy metal". */
export const CARD_DAMPING_RATIO = 0.78;
/** Gyro noise below this angle (rad) is ignored before it reaches the spring. */
export const GYRO_DEADZONE = 0.012;
const SUBSTEP = 1 / 240;
/** Hard limit on tilt rotation per axis: 0.25 rad (~14 deg), never enough to show the back. */
export const MAX_TILT_RAD = 0.25;
/** A still phone (no gyro change) recentres after this long. */
export const GYRO_REST_MS = 2000;
/** Readings averaged when the pass opens to find the user's own "flat" pose. */
export const GYRO_CALIBRATION_SAMPLES = 10;
/** Low-pass on the tilt target, per 60 Hz frame (0.05..0.1 = heavy, lagging). */
export const TILT_LERP = 0.08;

/**
 * currentOffset += (target - currentOffset) * factor, made frame-rate
 * independent so 60 Hz and 120 Hz screens lag by the same wall-clock time.
 */
export function lerpDamp(current: number, target: number, dt: number, factor = TILT_LERP): number {
  if (!Number.isFinite(target)) return current;
  const k = 1 - Math.pow(1 - factor, Math.max(dt, 0) * 60);
  return current + (target - current) * k;
}

/** Raw deviceorientation angles (deg) mapped to screen axes, compensating rotation. */
export function orientationToDegrees(beta: number, gamma: number, screenAngle: number): { x: number; y: number } {
  const a = ((screenAngle % 360) + 360) % 360;
  if (a === 90) return { x: beta, y: -gamma };
  if (a === 270) return { x: -beta, y: gamma };
  if (a === 180) return { x: -gamma, y: -beta };
  return { x: gamma, y: beta };
}

/** Normalized tilt relative to a calibrated zero pose (default: held at 45 deg). */
export function orientationToTilt(
  beta: number, gamma: number, screenAngle: number, zero: { x: number; y: number } = { x: 0, y: 45 },
): { x: number; y: number } {
  const d = orientationToDegrees(beta, gamma, screenAngle);
  return { x: clampTilt((d.x - zero.x) / 35), y: clampTilt((d.y - zero.y) / 35) };
}

/** Rotation target: recentre once a gyro reading has been still for GYRO_REST_MS. */
export function tiltTarget(value: number, msSinceChange: number, restMs: number): number {
  return msSinceChange > restMs ? 0 : clampTilt(value);
}

export type Spring = { x: number; v: number };

/** Reject sensor glitches and constrain normalized input to the visible range. */
export function clampTilt(value: number): number {
  return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
}

export function springDamping(m = CARD_MASS, k = CARD_STIFFNESS, zeta = CARD_DAMPING_RATIO): number {
  return 2 * zeta * Math.sqrt(k * m);
}

/** Semi-implicit Euler with fixed substeps: stable at 30, 60 or 120 Hz alike. */
export function stepSpring(s: Spring, target: number, dt: number, m = CARD_MASS, k = CARD_STIFFNESS, zeta = CARD_DAMPING_RATIO): Spring {
  const c = springDamping(m, k, zeta);
  let { x, v } = s;
  let left = Math.min(Math.max(dt, 0), 0.1);
  while (left > 1e-9) {
    const h = Math.min(SUBSTEP, left);
    const a = (-k * (x - target) - c * v) / m;
    v += a * h;
    x += v * h;
    left -= h;
  }
  return { x, v };
}

/** Low-pass + dead zone for raw gyro angles (rad). */
export function filterGyro(prev: number, raw: number, dt: number, cutoffHz = 6): number {
  if (Math.abs(raw - prev) < GYRO_DEADZONE) return prev;
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const a = dt / (rc + dt);
  return prev + (raw - prev) * a;
}

/** Free grab-and-spin: release keeps coasting with friction, then snaps to a face. */
export const SPIN_FRICTION = 3.2; // 1/s exponential decay of coasting speed
export const SPIN_SNAP_SPEED = 1.4; // rad/s: below this the card settles on a face
export const MAX_DRAG_PITCH = 0.6; // rad, vertical grab limit (~34 deg)
/** Radians of spin for dragging across the full card frame width. */
export const SPIN_PER_FRAME_WIDTH = Math.PI * 1.15;

export function nearestFace(angle: number): number {
  return Math.round(angle / Math.PI) * Math.PI;
}
export function isBackFace(angle: number): boolean {
  return Math.abs(Math.round(angle / Math.PI)) % 2 === 1;
}
export function decaySpin(v: number, dt: number, friction = SPIN_FRICTION): number {
  return v * Math.exp(-friction * dt);
}
export function clampDragPitch(p: number): number {
  return Math.max(-MAX_DRAG_PITCH, Math.min(MAX_DRAG_PITCH, p));
}

/** Continuous zoom (0 overview .. 1 closest). Wheel scales by delta magnitude, never a fixed step. */
export const ZOOM_WHEEL_RATE = 0.0025;
export function zoomFromWheel(z: number, deltaY: number, deltaMode = 0): number {
  const dy = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 100 : 1);
  return clampZoom(z - dy * ZOOM_WHEEL_RATE);
}
/** Pinch: finger distance ratio → zoom change (doubling the spread ≈ +0.6). */
export function zoomFromPinch(z: number, startZ: number, startDist: number, dist: number): number {
  void z;
  if (startDist <= 0) return clampZoom(startZ);
  return clampZoom(startZ + Math.log2(dist / startDist) * 0.6);
}
export function clampZoom(z: number): number {
  return Math.max(0, Math.min(1, z));
}
/** Pan offset in [-1,1]; at zero zoom the card is always centred. */
export function clampPan(p: { x: number; y: number }, z: number): { x: number; y: number } {
  if (z <= 0.001) return { x: 0, y: 0 };
  return { x: Math.max(-1, Math.min(1, p.x)), y: Math.max(-1, Math.min(1, p.y)) };
}
