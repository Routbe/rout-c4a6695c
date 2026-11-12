/**
 * Email trust levels for badges. A provider badge only appears when a
 * provider that enforces mailbox ownership vouched for the address; custom
 * domains are trusted only after our own DNS/TXT check (expired-domain takeover).
 */
export type EmailTrust = "provider" | "sovereign" | "domain" | "verified" | "unverified";

/** Mailbox hosts whose provider strictly owns the address. */
export const SOVEREIGN_DOMAINS: Record<string, string> = {
  "proton.me": "proton",
  "protonmail.com": "proton",
  "pm.me": "proton",
  "ik.me": "infomaniak",
  "etik.com": "infomaniak",
};
/** Providers whose verified e-mail claim we trust. */
export const STRICT_PROVIDERS = new Set(["proton", "infomaniak", "google", "github"]);

export function emailTrust(input: {
  email: string | null | undefined;
  emailVerified: boolean;
  /** Providers linked to this user that reported this exact e-mail verified. */
  verifiedBy: string[];
  /** Our own DNS/TXT proof for the e-mail's domain. */
  domainProven?: boolean;
}): EmailTrust {
  const email = input.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) return "unverified";
  const domain = email.split("@").pop()!;
  const owner = SOVEREIGN_DOMAINS[domain];
  if (owner && input.verifiedBy.includes(owner)) return "sovereign";
  const strict = input.verifiedBy.some((p) => STRICT_PROVIDERS.has(p));
  const providerHosted = Boolean(owner) || domain === "gmail.com" || domain === "googlemail.com";
  if (strict && providerHosted) return "provider";
  if (input.domainProven && input.emailVerified) return "domain";
  return input.emailVerified ? "verified" : "unverified";
}

export const EMAIL_TRUST_LABEL: Record<EmailTrust, string> = {
  sovereign: "Soeverein e-mailadres",
  provider: "Geverifieerd door provider",
  domain: "Domein geverifieerd",
  verified: "E-mail bevestigd",
  unverified: "Niet bevestigd",
};
