/**
 * Stateless, HMAC-signed sign-up ticket: the server checks consent, e-mail and
 * age first, then the browser registers a passkey with this ticket as WebAuthn
 * `context`. Without a passkey ceremony no account is ever created.
 *
 * Format: `su.<b64url(json)>.<b64url(hmac)>`, valid 10 minutes.
 */
import { SIGNUP_CONTEXT_PREFIX } from "./sign-in-policy";

const enc = new TextEncoder();
export const SIGNUP_TICKET_TTL_S = 10 * 60;

export type SignupTicket = {
  email: string;
  name: string;
  dob: string;
  parentEmail: string | null;
  consent: string;
  exp: number;
  nonce: string;
};

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

function key(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(`rout-signup-ticket:v1:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSignupTicket(secret: string, data: Omit<SignupTicket, "exp" | "nonce">, nowS: number): Promise<string> {
  const ticket: SignupTicket = { ...data, exp: nowS + SIGNUP_TICKET_TTL_S, nonce: b64url(crypto.getRandomValues(new Uint8Array(12))) };
  const body = b64url(enc.encode(JSON.stringify(ticket)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), enc.encode(body)));
  return `${SIGNUP_CONTEXT_PREFIX}${body}.${b64url(sig)}`;
}

export async function verifySignupTicket(secret: string, token: string | null | undefined, nowS: number): Promise<SignupTicket | null> {
  if (!token || token.length > 2048 || !token.startsWith(SIGNUP_CONTEXT_PREFIX)) return null;
  const [body, sig] = token.slice(SIGNUP_CONTEXT_PREFIX.length).split(".");
  if (!body || !sig) return null;
  let ok = false;
  try {
    ok = await crypto.subtle.verify("HMAC", await key(secret), fromB64url(sig) as BufferSource, enc.encode(body));
  } catch {
    return null;
  }
  if (!ok) return null;
  try {
    const t = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SignupTicket;
    if (typeof t.email !== "string" || typeof t.exp !== "number" || t.exp < nowS) return null;
    return t;
  } catch {
    return null;
  }
}
