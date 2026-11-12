/** Server-only helpers for issuing and verifying ROUT API keys. */

export function newApiKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const body = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const key = `rout_sk_${body}`;
  return { key, prefix: key.slice(0, 16) };
}

export async function hashApiKey(key: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
