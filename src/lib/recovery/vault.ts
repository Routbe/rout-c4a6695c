/**
 * Recovery vault: a fresh 256-bit vault key encrypts the Master Key entropy
 * (AES-256-GCM, AAD bound to vault id + version); the vault key, not the
 * Master Key, is split 3-of-5. Rotating creates a new vault id and key, so
 * every old shard stops matching the stored commitments and ciphertext.
 * Runs inside the crypto enclave worker; callers wipe the entropy they pass.
 */
import { combine, split } from "./shamir";
import { SHARD_VERSION, VAULT_ID_BYTES, commitmentOf, decodeShard, encodeShard, hex, unhex } from "./shard-codec";

export const RECOVERY_THRESHOLD = 3;
export const RECOVERY_SHARDS = 5;

export type RecoveryVault = {
  vaultId: string; // hex
  version: number;
  threshold: number;
  sealedMaster: string; // base64url iv.ct
  commitments: string[]; // index-1 ordered
};

const enc = new TextEncoder();
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const aad = (vaultId: string, version: number) => enc.encode(`rout.recovery.master.v${version}|${vaultId}`);

export async function createVault(entropy: Uint8Array): Promise<{ vault: RecoveryVault; shards: string[] }> {
  const vaultKey = crypto.getRandomValues(new Uint8Array(32));
  const vaultIdBytes = crypto.getRandomValues(new Uint8Array(VAULT_ID_BYTES));
  const vaultId = hex(vaultIdBytes);
  const shares = split(vaultKey, RECOVERY_THRESHOLD, RECOVERY_SHARDS);
  try {
    const key = await crypto.subtle.importKey("raw", vaultKey as BufferSource, "AES-GCM", false, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(vaultId, SHARD_VERSION) as BufferSource }, key, entropy as BufferSource));
    const shards: string[] = [];
    const commitments: string[] = [];
    for (const s of shares) {
      shards.push(await encodeShard({ version: SHARD_VERSION, threshold: RECOVERY_THRESHOLD, index: s.x, vaultId: vaultIdBytes, share: s.y }));
      commitments.push(await commitmentOf(vaultIdBytes, s.x, s.y));
    }
    return { vault: { vaultId, version: SHARD_VERSION, threshold: RECOVERY_THRESHOLD, sealedMaster: `${b64u(iv)}.${b64u(ct)}`, commitments }, shards };
  } finally {
    vaultKey.fill(0);
    for (const s of shares) s.y.fill(0);
  }
}

export function assertVault(v: unknown): RecoveryVault {
  const o = v as RecoveryVault;
  if (!o || typeof o !== "object" || !/^[0-9a-f]{32}$/.test(o.vaultId) || o.version !== SHARD_VERSION || o.threshold !== RECOVERY_THRESHOLD
    || typeof o.sealedMaster !== "string" || !/^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{40,200}$/.test(o.sealedMaster)
    || !Array.isArray(o.commitments) || o.commitments.length !== RECOVERY_SHARDS || !o.commitments.every((c) => /^[0-9a-f]{64}$/.test(c))) {
    throw new Error("invalid_vault");
  }
  return o;
}

export type ShardCheck = { index: number; ok: boolean; reason?: "wrong_vault" | "forged" | "duplicate" | "unreadable" };

/** Validates one typed/scanned shard against the vault without reconstructing anything. */
export async function checkShard(text: string, input: RecoveryVault): Promise<ShardCheck> {
  const vault = assertVault(input);
  let s;
  try { s = await decodeShard(text); } catch { return { index: 0, ok: false, reason: "unreadable" }; }
  try {
    if (hex(s.vaultId) !== vault.vaultId) return { index: s.index, ok: false, reason: "wrong_vault" };
    const expected = vault.commitments[s.index - 1];
    const ok = expected !== undefined && (await commitmentOf(s.vaultId, s.index, s.share)) === expected;
    return ok ? { index: s.index, ok: true } : { index: s.index, ok: false, reason: "forged" };
  } finally {
    s.share.fill(0);
  }
}

/** Reconstructs the Master Key entropy. Throws unless `threshold` valid, distinct shards are given. */
export async function openVault(texts: string[], input: RecoveryVault): Promise<Uint8Array> {
  const vault = assertVault(input);
  const vaultIdBytes = unhex(vault.vaultId);
  const seen = new Map<number, Uint8Array>();
  try {
    for (const t of texts) {
      const s = await decodeShard(t);
      if (hex(s.vaultId) !== vault.vaultId) throw new Error("wrong_vault");
      if ((await commitmentOf(vaultIdBytes, s.index, s.share)) !== vault.commitments[s.index - 1]) throw new Error("forged_shard");
      if (!seen.has(s.index)) seen.set(s.index, s.share); else s.share.fill(0);
    }
    if (seen.size < vault.threshold) throw new Error("not_enough_shards");
    const chosen = [...seen.entries()].slice(0, vault.threshold).map(([x, y]) => ({ x, y }));
    const vaultKey = combine(chosen);
    try {
      const key = await crypto.subtle.importKey("raw", vaultKey as BufferSource, "AES-GCM", false, ["decrypt"]);
      const [iv, ct] = vault.sealedMaster.split(".");
      try {
        return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64u(iv ?? "") as BufferSource, additionalData: aad(vault.vaultId, vault.version) as BufferSource }, key, fromB64u(ct ?? "") as BufferSource));
      } catch {
        throw new Error("decrypt_failed");
      }
    } finally {
      vaultKey.fill(0);
    }
  } finally {
    for (const y of seen.values()) y.fill(0);
  }
}

const shardAad = (vaultId: string) => enc.encode(`rout.recovery.passkey-shard.v1|${vaultId}`);
async function prfKey(prf: Uint8Array, usage: KeyUsage) {
  if (prf.length < 32) throw new Error("weak_prf");
  const base = await crypto.subtle.importKey("raw", prf as BufferSource, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: enc.encode("rout.recovery.v1") as BufferSource, info: enc.encode("passkey-shard") as BufferSource },
    base, { name: "AES-GCM", length: 256 }, false, [usage]);
}

/** Wraps one shard under a passkey PRF output; only that authenticator can unwrap it. */
export async function sealShardWithPrf(prf: Uint8Array, shard: string, vaultId: string): Promise<string> {
  const key = await prfKey(prf, "encrypt");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: shardAad(vaultId) as BufferSource }, key, enc.encode(shard) as BufferSource));
  return `v1.${b64u(iv)}.${b64u(ct)}`;
}

export async function openShardWithPrf(prf: Uint8Array, blob: string, vaultId: string): Promise<string> {
  const [v, iv, ct] = blob.split(".");
  if (v !== "v1" || !iv || !ct) throw new Error("invalid_input");
  const key = await prfKey(prf, "decrypt");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64u(iv) as BufferSource, additionalData: shardAad(vaultId) as BufferSource }, key, fromB64u(ct) as BufferSource);
  return new TextDecoder().decode(pt);
}
