/**
 * Servervriendelijk polling-schema voor asynchrone betalingen
 * (bunq.me-links, QR, overschrijvingen, redirect-methodes).
 *
 * Hoe langer een betaling openstaat, hoe minder vaak we hoeven te checken:
 * de eerste minuten wil de gebruiker een instant succes-scherm, daarna volstaat
 * een trage hartslag zodat we de database en Stripe niet overbelasten.
 */

export interface PollStep {
  /** Vanaf hoeveel milliseconden na de start deze stap geldt. */
  fromMs: number;
  /** Interval tussen twee checks binnen deze stap. */
  everyMs: number;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** Schema, oplopend op startdrempel. */
export const POLL_SCHEDULE: readonly PollStep[] = [
  { fromMs: 0, everyMs: 5 * SECOND },
  { fromMs: 5 * MINUTE, everyMs: 1 * MINUTE },
  { fromMs: 15 * MINUTE, everyMs: 2 * MINUTE },
  { fromMs: 30 * MINUTE, everyMs: 5 * MINUTE },
  { fromMs: 60 * MINUTE, everyMs: 10 * MINUTE },
  { fromMs: 120 * MINUTE, everyMs: 30 * MINUTE },
] as const;

/**
 * Wachttijd tot de volgende check, gegeven hoe lang de betaling al openstaat.
 * `elapsedMs` mag alles zijn: negatieve of onbekende waarden vallen terug op
 * het snelste interval.
 */
export function nextPollDelayMs(elapsedMs: number): number {
  const elapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  let delay = POLL_SCHEDULE[0]!.everyMs;
  for (const step of POLL_SCHEDULE) {
    if (elapsed >= step.fromMs) delay = step.everyMs;
    else break;
  }
  return delay;
}
