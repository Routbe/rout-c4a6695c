/** Pro-rechten volgen het account, niet het publieke identiteitsvinkje. */
export function hasProfilePro(owner: { verified?: unknown; is_paid?: unknown; tier?: unknown }): boolean {
  return owner.verified === true || owner.is_paid === true || owner.tier === "pro";
}
