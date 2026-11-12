/**
 * User-list segments, kept in a client-safe module.
 *
 * The admin UI needs these values and the `UserSegment` type, but
 * `*.server.ts` files are blocked from client bundles — importing the type
 * from there breaks the page build. Server code re-exports from here.
 */

export const USER_SEGMENTS = [
  "all",
  "free",
  "verified_paid",
  "alias_unsynced",
  "suspended_or_banned",
] as const;

export type UserSegment = (typeof USER_SEGMENTS)[number];

export const USER_SEGMENT_LABELS: Record<UserSegment, string> = {
  all: "All users",
  free: "Free only",
  verified_paid: "Verified & paid",
  alias_unsynced: "Alias not synced",
  suspended_or_banned: "Suspended or banned",
};
