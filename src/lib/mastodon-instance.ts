/**
 * Fediverse instance handling — shared by the browser dialog and the server.
 *
 * Users type anything: "mastodon.social", "https://fosstodon.org/",
 * "@me@mstdn.be". All three must land on the same host, and anything that is
 * not a public DNS name is rejected before a request leaves the app.
 */

const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

const BLOCKED = new Set(["localhost", "localhost.localdomain", "example.com", "rout.be"]);

/** Strips scheme, path, handle prefix and casing. Returns null when unusable. */
export function normalizeInstance(input: string): string | null {
  let value = (input || "").trim().toLowerCase();
  if (!value) return null;

  // "@user@instance" or "user@instance" → keep the part after the last @.
  if (value.includes("@")) value = value.slice(value.lastIndexOf("@") + 1);

  value = value.replace(/^[a-z]+:\/\//, "");
  value = value.split(/[/?#]/)[0] ?? "";
  value = value.replace(/\.+$/, "");
  if (value.includes(":")) value = value.split(":")[0] ?? ""; // no custom ports

  if (!value || value.length > 253) return null;
  if (BLOCKED.has(value)) return null;
  if (/^\d+(\.\d+)*$/.test(value)) return null; // bare IPv4
  if (!HOST_RE.test(value)) return null;
  return value;
}

/** Human-readable handle for a verified account, always "@user@instance". */
export function fediverseHandle(username: string, instance: string): string {
  return `@${username}@${instance}`;
}

/** Stable synthetic address: Mastodon never exposes the real e-mail. */
export function fediverseEmail(username: string, instance: string): string {
  return `${username.toLowerCase()}@${instance}`;
}

export const MASTODON_SCOPES = "read:accounts";
