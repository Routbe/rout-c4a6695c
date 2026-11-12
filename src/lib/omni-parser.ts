/**
 * Omni-Bar parser for the `/` gateway: turns free text into one routing intent.
 * Pure and browser-safe so the same rules run in the input hint and on submit.
 */
export type OmniIntent =
  | { kind: "empty" }
  | { kind: "url"; url: string; destination: string }
  | { kind: "handle"; handle: string; destination: string }
  | { kind: "command"; command: string; destination: string }
  | { kind: "unknown"; input: string };

/** Commands accept "/name", ">name" or the bare word. */
export const OMNI_COMMANDS: Record<string, string> = {
  studio: "/studio",
  qr: "/studio?mode=qr",
  dashboard: "/dashboard",
  cockpit: "/dashboard",
  inbox: "/dashboard",
  identity: "/dashboard/identity",
  apps: "/dashboard/identity",
  relays: "/dashboard/identity",
  assets: "/dashboard/assets",
  links: "/dashboard/links",
  developers: "/developers",
  docs: "/developers",
  api: "/developers",
  explore: "/explore",
  login: "/auth/sign-in",
  "sign-in": "/auth/sign-in",
  settings: "/settings",
};

const HANDLE = /^@([a-z0-9][a-z0-9._-]{1,29})$/i;
const BARE_DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?::\d{2,5})?(?:[/?#]\S*)?$/i;

function studioFor(url: string): string {
  return `/studio?mode=qr&url=${encodeURIComponent(url)}`;
}

function asHttpUrl(value: string): string | null {
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function parseOmniInput(raw: string): OmniIntent {
  const input = raw.trim();
  if (!input) return { kind: "empty" };

  const commandWord = input.replace(/^[/>]\s*/, "").toLowerCase();
  if (/^[/>]/.test(input) || !/[\s.@:]/.test(input)) {
    const destination = OMNI_COMMANDS[commandWord];
    if (destination) return { kind: "command", command: commandWord, destination };
  }

  if (/^https?:\/\//i.test(input)) {
    const url = asHttpUrl(input);
    return url ? { kind: "url", url, destination: studioFor(url) } : { kind: "unknown", input };
  }

  const handle = HANDLE.exec(input);
  if (handle) {
    const name = handle[1]!.toLowerCase();
    return { kind: "handle", handle: name, destination: `/@${name}` };
  }

  if (!/\s/.test(input) && !input.includes("@") && BARE_DOMAIN.test(input)) {
    const url = asHttpUrl(`https://${input}`);
    if (url) return { kind: "url", url, destination: studioFor(url) };
  }

  return { kind: "unknown", input };
}
