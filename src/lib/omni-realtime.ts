/** Shared Web Crypto ticket contract; no runtime credentials or server imports. */
export const OMNI_TICKET_SECONDS = 300;
const encode = (value: Uint8Array) => btoa(String.fromCharCode(...value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const decode = (value: string) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
export type OmniTicket = { sub: string; aud: string; exp: number; purpose: "omni-events" };
async function key(secret: string) {
  if (secret.length < 32) throw new Error("omni_realtime_not_configured");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function signOmniTicket(sub: string, aud: string, secret: string, now = Date.now()): Promise<string> {
  const body = encode(new TextEncoder().encode(JSON.stringify({ sub, aud, exp: Math.floor(now / 1000) + OMNI_TICKET_SECONDS, purpose: "omni-events" })));
  const signature = await crypto.subtle.sign("HMAC", await key(secret), new TextEncoder().encode(body));
  return `${body}.${encode(new Uint8Array(signature))}`;
}
export async function verifyOmniTicket(token: string, aud: string, secret: string, now = Date.now()): Promise<OmniTicket | null> {
  try {
    if (token.length > 2048) return null;
    const parts = token.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    if (!(await crypto.subtle.verify("HMAC", await key(secret), decode(parts[1]), new TextEncoder().encode(parts[0])))) return null;
    const value = JSON.parse(new TextDecoder().decode(decode(parts[0]))) as OmniTicket;
    const seconds = Math.floor(now / 1000);
    return value.purpose === "omni-events" && value.aud === aud && /^[0-9a-f-]{36}$/.test(value.sub) &&
      Number.isInteger(value.exp) && value.exp > seconds && value.exp <= seconds + OMNI_TICKET_SECONDS ? value : null;
  } catch { return null; }
}