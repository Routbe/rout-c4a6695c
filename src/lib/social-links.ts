/**
 * Single source of truth for every external social / network profile link.
 * Update here — never hardcode a handle in a component.
 *
 * All handles below are the official ROUT channels (audited 2026-08).
 */
export const SOCIAL_LINKS = {
  instagram: "https://instagram.com/routlabs",
  linkedin: "https://linkedin.com/company/routbe",
  github: "https://github.com/routbe",
  bluesky: "https://bsky.app/profile/rout.be",
  mastodon: "https://mastodon.social/@routbe",
  eyou: "https://eyou.social/u/rout",
} as const;

/** Repo + issue tracker live under the same GitHub account. */
export const GITHUB_ACCOUNT = SOCIAL_LINKS.github;
export const GITHUB_REPO_URL = `${SOCIAL_LINKS.github}/rout`;
export const GITHUB_ISSUES_URL = `${GITHUB_REPO_URL}/issues`;

/** Infrastructure / status endpoints. */
export const STATUS_PAGE_URL = "https://status.rout.be";

/** Attributes every external link must carry. */
export const EXTERNAL_LINK_PROPS = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const;
