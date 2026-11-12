/** Workspace routing. Pure: the server feeds counts and freedom read inside the lock window. */
import { andBits, type DayBits } from "./bitmap";

export interface HostCandidate {
  userId: string;
  priority: number; // higher wins ties
  bookingsThisMonth: number; // active bookings in the slot's UTC calendar month
  isFree: boolean;
}

/** ROUND_ROBIN order: free hosts only, fewest bookings first, then priority desc, then id for determinism. */
export function roundRobinOrder(hosts: HostCandidate[]): string[] {
  return hosts
    .filter((h) => h.isFree)
    .sort((a, b) => a.bookingsThisMonth - b.bookingsThisMonth || b.priority - a.priority || a.userId.localeCompare(b.userId))
    .map((h) => h.userId);
}

/** COLLECTIVE: joint free time is the bitwise AND of every host's day bits; a missing host day = busy. */
export function collectiveDay(hostBits: (DayBits | undefined)[]): DayBits {
  return andBits(hostBits.map((b) => b ?? "0".repeat(96)));
}
