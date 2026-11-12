/** Compact, URL-safe transport for a contact-card value bag. */

export function encodeCardPayload(values: Record<string, string>): string {
  const json = JSON.stringify(values);
  if (typeof window === "undefined") return "";
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeCardPayload(encoded: string): Record<string, string> | null {
  try {
    const base = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base + "=".repeat((4 - (base.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v.slice(0, 2000);
    }
    return out;
  } catch {
    return null;
  }
}

/** Absolute URL of the hosted contact landing page for these values. */
export function cardLandingUrl(values: Record<string, string>): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://rout.be";
  return `${origin}/card?d=${encodeCardPayload(values)}`;
}
