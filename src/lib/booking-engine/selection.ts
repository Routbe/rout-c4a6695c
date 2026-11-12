import { utcInstant } from "./types";

/** URL context is advisory: only a currently offered UTC instant can be selected. */
export function validBookingStart(value: unknown): string | undefined {
  const parsed = utcInstant.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function offeredSelection(start: string | undefined, slots: readonly string[]): string | null {
  return start && slots.includes(start) ? start : null;
}