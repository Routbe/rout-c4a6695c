/** Pink creator badge: only for members with a proven audience elsewhere. */
export const CREATOR_MIN_REACH = 10_000;

export function isCreatorEligible(totalReach: number | null | undefined): boolean {
  return typeof totalReach === "number" && Number.isFinite(totalReach) && totalReach >= CREATOR_MIN_REACH;
}
