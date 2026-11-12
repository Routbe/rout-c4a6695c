/**
 * Recovery shard wire format (printable, QR- and NFC-friendly).
 *
 *   RS1-XXXX-XXXX-...   Crockford base32 of:
 *   version(1) | threshold(1) | index(1) | vaultId(16) | share(32) | check(4)
 *
 * `check` = first 4 bytes of SHA-256("rout.shard.check.v1" | body): catches
 * typos and truncation offline. Authenticity is proven separately against the
 * vault's per-shard commitments (see commitmentOf), so a forged shard is named
 * before any reconstruction is attempted.
 */
export const SHARD_VERSION = 1;
export const SHARD_PREFIX = "RS1";
export const VAULT_ID_BYTES = 16;
export const SHARE_BYTES = 32;
const BODY = 3 + VAULT_ID_BYTES + SHARE_BYTES;
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export type Shard = { version: number; threshold: number; index: number; vaultId: Uint8Array; share: Uint8Array };

const enc = new TextEncoder();
async function sha256(...parts: Uint8Array[]): Promise<Uint8Array> {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { buf.set(p, o); o += p.length; }
  return new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
}

function base32(bytes: Uint8Array): string {
  let out = "", bits = 0, value = 0;
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function unbase32(text: string): Uint8Array {
  const clean = text.toUpperCase().replace(/[O]/g, "0").replace(/[IL]/g, "1").replace(/[^0-9A-Z]/g, "");
  const out: number[] = [];
  let bits = 0, value = 0;
  for (const ch of clean) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error("invalid_shard");
    value = ((value << 5) | v) & 0xffff; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Uint8Array.from(out);
}

export async function encodeShard(s: Shard): Promise<string> {
  if (s.vaultId.length !== VAULT_ID_BYTES || s.share.length !== SHARE_BYTES) throw new Error("invalid_shard");
  const body = new Uint8Array(BODY);
  body[0] = s.version; body[1] = s.threshold; body[2] = s.index;
  body.set(s.vaultId, 3); body.set(s.share, 3 + VAULT_ID_BYTES);
  const check = (await sha256(enc.encode("rout.shard.check.v1"), body)).subarray(0, 4);
  const full = new Uint8Array(BODY + 4); full.set(body); full.set(check, BODY);
  const groups = base32(full).match(/.{1,4}/g) ?? [];
  body.fill(0); full.fill(0);
  return `${SHARD_PREFIX}-${groups.join("-")}`;
}

export async function decodeShard(text: string): Promise<Shard> {
  const trimmed = text.trim().toUpperCase();
  if (!trimmed.startsWith(`${SHARD_PREFIX}-`)) throw new Error("invalid_shard");
  const bytes = unbase32(trimmed.slice(SHARD_PREFIX.length + 1));
  if (bytes.length < BODY + 4) throw new Error("invalid_shard");
  const body = bytes.subarray(0, BODY);
  const check = (await sha256(enc.encode("rout.shard.check.v1"), body)).subarray(0, 4);
  let diff = 0;
  for (let i = 0; i < 4; i++) diff |= check[i]! ^ bytes[BODY + i]!;
  if (diff !== 0) throw new Error("shard_checksum");
  if (body[0] !== SHARD_VERSION) throw new Error("shard_version");
  const threshold = body[1]!, index = body[2]!;
  if (threshold < 2 || index < 1) throw new Error("invalid_shard");
  return { version: body[0]!, threshold, index, vaultId: body.slice(3, 3 + VAULT_ID_BYTES), share: body.slice(3 + VAULT_ID_BYTES, BODY) };
}

/** Public commitment for shard `index` of a vault; safe to store server-side. */
export async function commitmentOf(vaultId: Uint8Array, index: number, share: Uint8Array): Promise<string> {
  const d = await sha256(enc.encode("rout.shard.commit.v1"), vaultId, Uint8Array.of(index), share);
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
export const unhex = (s: string) => Uint8Array.from(s.match(/.{2}/g) ?? [], (h) => parseInt(h, 16));
