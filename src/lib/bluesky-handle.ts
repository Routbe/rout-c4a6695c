/** Bluesky handle helpers shared by the sign-in screen and tests. */

export const BLUESKY_SUFFIXES = ["bsky.social", "bsky.team", "blacksky.app", "eurosky.social"];

const HANDLE_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** "@Jona" → "jona.bsky.social"; "jona.be" stays. Returns null when unusable. */
export function normalizeBlueskyHandle(input: string): string | null {
  let value = (input || "").trim().toLowerCase().replace(/^@+/, "");
  value = value.replace(/^https?:\/\/bsky\.app\/profile\//, "").split(/[/?#\s]/)[0] ?? "";
  if (!value) return null;
  if (!value.includes(".")) value = `${value}.bsky.social`;
  return HANDLE_RE.test(value) && value.length <= 253 ? value : null;
}

/** Replace whatever suffix was typed with the chosen one. */
export function withBlueskySuffix(input: string, suffix: string): string {
  const name = (input || "").trim().toLowerCase().replace(/^@+/, "").split(".")[0] ?? "";
  return name ? `${name}.${suffix}` : `.${suffix}`;
}
