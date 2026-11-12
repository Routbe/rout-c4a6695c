/**
 * Pure rule: may this account use the Developer Console?
 * Verified / paid / early believer, a claimed approved root handle, or a full
 * admin — and never when banned or suspended. Free /u/ aliases have none of
 * these signals and stay blocked.
 */
export type ConsoleAccessInput = {
  verified?: boolean | null;
  isPaid?: boolean | null;
  isEarlyBeliever?: boolean | null;
  isBanned?: boolean | null;
  isSuspended?: boolean | null;
  hasClaimedRootHandle?: boolean;
  isAdmin?: boolean;
};

export function canUseDeveloperConsole(input: ConsoleAccessInput | null | undefined): boolean {
  if (!input) return false;
  if (input.isBanned === true || input.isSuspended === true) return false;
  return (
    input.verified === true ||
    input.isPaid === true ||
    input.isEarlyBeliever === true ||
    input.hasClaimedRootHandle === true ||
    input.isAdmin === true
  );
}
