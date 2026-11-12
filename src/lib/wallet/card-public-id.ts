/**
 * Static, printable card id for the metal card QR (/v/<id>). AES-GCM with a
 * synthetic IV (HMAC of the plaintext), so the id is stable, unforgeable and
 * reveals neither the account id nor the handle. Pure WebCrypto.
 */
import { b64urlDecode, b64urlEncode } from "./hardware-crypto";

const enc = new TextEncoder();
const dec = new TextDecoder();

async function subKeys(master: Uint8Array) {
  const ikm = await crypto.subtle.importKey("raw", master as BufferSource, "HKDF", false, ["deriveKey"]);
  const p = (info: string) => ({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: enc.encode(info) });
  const aes = await crypto.subtle.deriveKey(p("rout-card-public-id:v1:aes"), ikm, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const mac = await crypto.subtle.deriveKey(p("rout-card-public-id:v1:iv"), ikm, { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign"]);
  return { aes, mac };
}

export async function sealPublicCardId(master: Uint8Array, accountId: string, space: "root" | "alias"): Promise<string> {
  const { aes, mac } = await subKeys(master);
  const plain = enc.encode(`${space === "alias" ? "a" : "r"}|${accountId.toLowerCase()}`);
  const iv = new Uint8Array(await crypto.subtle.sign("HMAC", mac, plain)).slice(0, 12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, plain));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return b64urlEncode(out);
}

/** Never throws: tampered or foreign ids return null. */
export async function openPublicCardId(master: Uint8Array, id: string): Promise<{ accountId: string; space: "root" | "alias" } | null> {
  const raw = b64urlDecode(id);
  if (!raw || raw.length < 12 + 16 + 3) return null;
  try {
    const { aes } = await subKeys(master);
    const plain = dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, aes, raw.slice(12)));
    const m = /^([ra])\|([0-9a-f-]{36})$/.exec(plain);
    return m ? { accountId: m[2]!, space: m[1] === "a" ? "alias" : "root" } : null;
  } catch {
    return null;
  }
}
