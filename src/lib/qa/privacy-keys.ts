/**
 * Pure, browser-safe privacy helpers for anonymous Q&A: key epochs, the
 * constant-time send budget and fuzzy arrival labels. Keyed hashing itself
 * lives in privacy-keys.server.ts.
 */

const DAY_MS = 86_400_000;
/** Abuse keys rotate every 30 days; the previous epoch is still checked for bans. */
export const ABUSE_EPOCH_DAYS = 30;
/** Every send answer takes at least this long… */
export const SEND_FLOOR_MS = 1200;
/** …and slower ones are rounded up to the next step, so durations reveal nothing. */
export const SEND_STEP_MS = 400;

export function abuseEpoch(nowMs: number): number {
  return Math.floor(nowMs / (ABUSE_EPOCH_DAYS * DAY_MS));
}

export function dayEpoch(nowMs: number): number {
  return Math.floor(nowMs / DAY_MS);
}

/** Total duration a send answer must take, given how long the real work took. */
export function paddedDuration(elapsedMs: number): number {
  if (elapsedMs <= SEND_FLOOR_MS) return SEND_FLOOR_MS;
  return SEND_FLOOR_MS + Math.ceil((elapsedMs - SEND_FLOOR_MS) / SEND_STEP_MS) * SEND_STEP_MS;
}

/**
 * Runs `work` and resolves no earlier than its padded duration, whatever the
 * outcome (including errors, which resolve to `fallback`).
 */
export async function constantTime<T>(
  work: () => Promise<T>,
  fallback: T,
  clock: { now: () => number; sleep: (ms: number) => Promise<void> } = {
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  },
): Promise<T> {
  const started = clock.now();
  let out = fallback;
  try {
    out = await work();
  } catch {
    out = fallback;
  }
  const elapsed = clock.now() - started;
  const wait = paddedDuration(elapsed) - elapsed;
  if (wait > 0) await clock.sleep(wait);
  return out;
}

export type ArrivalLabel =
  | { key: "justNow" | "thisMorning" | "thisAfternoon" | "thisEvening" | "lastNight" | "yesterday" | "yesterdayEvening" | "fewDays" | "fewWeeks" }
  | { key: "month"; date: Date };

/**
 * Coarse arrival moment for the recipient. `arrivedHour` is already truncated
 * to the hour (and delayed) by the server; this never shows minutes.
 */
export function fuzzyArrival(arrivedHour: Date, now: Date): ArrivalLabel {
  const ageMs = now.getTime() - arrivedHour.getTime();
  if (ageMs < 2 * 3_600_000) return { key: "justNow" };
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const h = arrivedHour.getHours();
  const t = arrivedHour.getTime();
  if (t >= startOfToday) {
    if (h < 6) return { key: "lastNight" };
    if (h < 12) return { key: "thisMorning" };
    if (h < 18) return { key: "thisAfternoon" };
    return { key: "thisEvening" };
  }
  if (t >= startOfToday - DAY_MS) return { key: h >= 18 ? "yesterdayEvening" : "yesterday" };
  if (ageMs < 7 * DAY_MS) return { key: "fewDays" };
  if (ageMs < 30 * DAY_MS) return { key: "fewWeeks" };
  return { key: "month", date: arrivedHour };
}
