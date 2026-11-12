/**
 * Privacy shield for public profile reads. A profile only shows identity names when it
 * publicly carries a badge that vouches for them: verified/domain for everyone, the
 * influencer badge only for approved business/influencer accounts. Otherwise the
 * legal name, trade (business) name and country never leave the server.
 */
export type ShieldPrefs = { badgeType: string; badgeVisible: boolean };

export function identityNamesPublic(prefs: ShieldPrefs, approved: boolean): boolean {
  if (!prefs.badgeVisible) return false;
  if (prefs.badgeType === "verified" || prefs.badgeType === "domain") return true;
  return approved && prefs.badgeType === "influencer";
}

export function applyPrivacyShield(profile: Record<string, unknown>, prefs: ShieldPrefs): void {
  const approved = profile["is_business"] === true || profile["is_influencer"] === true;
  if (identityNamesPublic(prefs, approved)) return;
  profile["verified_legal_name"] = null;
  profile["business_name"] = null;
  profile["country_code"] = null;
}
