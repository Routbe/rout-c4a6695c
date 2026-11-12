import { createHmac, timingSafeEqual } from "crypto";

/** Incoming webhooks older or newer than this (seconds) are refused as replays. */
export const WEBHOOK_TOLERANCE_SEC = 300;

export function withinReplayWindow(timestampSec: number, nowMs: number = Date.now()): boolean {
  if (!Number.isFinite(timestampSec) || timestampSec <= 0) return false;
  return Math.abs(nowMs / 1000 - timestampSec) <= WEBHOOK_TOLERANCE_SEC;
}

/** Stripe-Signature check: valid v1 HMAC of `t.body` AND t within the replay window. */
export function verifyStripeSignature(body: string, header: string, secret: string, nowMs: number = Date.now()): boolean {
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, ...v]) => v.join("="));
  if (!t || sigs.length === 0) return false;
  const digest = Buffer.from(createHmac("sha256", secret).update(`${t}.${body}`).digest("hex"), "hex");
  const valid = sigs.some((s) => {
    const left = Buffer.from(s, "hex");
    return left.length === digest.length && timingSafeEqual(left, digest);
  });
  return valid && withinReplayWindow(Number(t), nowMs);
}
