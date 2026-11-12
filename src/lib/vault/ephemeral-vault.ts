/**
 * Zero-knowledge ephemeral handoff (AI → human), shared by server and browser.
 * Web Crypto only; no secrets are ever logged or persisted by this module.
 *
 * One 256-bit ephemeral secret yields two independent HKDF keys:
 *   - `enc`   → AES-256-GCM key that seals the workspace configuration;
 *   - `claim` → a one-way claim proof. The server stores only argon2id(proof)
 *               and the browser proves knowledge with the proof, so the raw
 *               secret never has to travel back to the server.
 */
import { z } from "zod";
import { b64u, isSealedBlob, open, seal, type SealedBlob } from "@/lib/e2ee/crypto";
import { wipe } from "@/lib/crypto/wipe";
import { designCanvasSchema } from "./design-tokens";

export { handoffCode, parseHandoffCode } from "./handoff-code";

const enc = new TextEncoder();

export const VAULT_TTL_MINUTES = 60;
/** Keeps the sealed blob (base64url + GCM tag) under the 64 KiB blind-column limit. */
export const VAULT_MAX_CONFIG_BYTES = 32 * 1024;
export const VAULT_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const VAULT_PROOF_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const WORKSPACE_KEY_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

type Rnd = (n: number) => Uint8Array;
const defaultRnd: Rnd = (n) => crypto.getRandomValues(new Uint8Array(n));

/** The workspace configuration an agent hands over. Name/slug are required metadata; any other JSON stays sealed. */
export const vaultConfigSchema = z.looseObject({
  name: z.string().trim().min(1).max(80),
  slug: z.string().trim().toLowerCase().max(40).optional(),
  description: z.string().trim().max(280).optional(),
  /** Workspace design; strict tokens, contrast-checked (see design-tokens.ts). */
  canvas: designCanvasSchema.optional(),
});
export type VaultConfig = z.infer<typeof vaultConfigSchema>;

/** Body of POST /api/v1/agent/vault. Strict at the top level so typos are reported. */
export const vaultRequestSchema = z.strictObject({ config: vaultConfigSchema });

export function configByteLength(config: unknown): number {
  return enc.encode(JSON.stringify(config)).length;
}

/** 32 random bytes, base64url (43 chars). */
export function generateEphemeralSecret(rnd: Rnd = defaultRnd): string {
  return b64u.encode(rnd(32));
}

export function isEphemeralSecret(v: unknown): v is string {
  return typeof v === "string" && VAULT_SECRET_PATTERN.test(v);
}

/** Non-extractable HKDF base key; the decoded secret bytes are wiped right after import. */
export async function vaultHkdfBase(secret: string): Promise<CryptoKey> {
  if (!isEphemeralSecret(secret)) throw new Error("invalid_ephemeral_secret");
  const raw = b64u.decode(secret);
  try {
    return await crypto.subtle.importKey("raw", raw as BufferSource, "HKDF", false, ["deriveKey", "deriveBits"]);
  } finally {
    wipe(raw);
  }
}

const HKDF_SALT = enc.encode("rout.vault.v1");

export function vaultEncryptionKeyFrom(base: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: enc.encode("rout.vault.v1.enc") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function vaultClaimProofFrom(base: CryptoKey): Promise<string> {
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: enc.encode("rout.vault.v1.claim") }, base, 256),
  );
  try {
    return b64u.encode(bits);
  } finally {
    wipe(bits);
  }
}

/** Non-extractable AES-256-GCM key for the vault payload. */
export async function vaultEncryptionKey(secret: string): Promise<CryptoKey> {
  return vaultEncryptionKeyFrom(await vaultHkdfBase(secret));
}

/** One-way claim proof (base64url, 43 chars). Knowing it does not reveal the secret or the payload key. */
export async function vaultClaimProof(secret: string): Promise<string> {
  return vaultClaimProofFrom(await vaultHkdfBase(secret));
}

/** Binds the ciphertext to its vault: a payload copied into another vault does not open. */
export const vaultAad = (vaultId: string) => `rout.vault.v1:${vaultId.toLowerCase()}`;

export async function sealVaultPayload(secret: string, vaultId: string, config: unknown): Promise<SealedBlob> {
  return seal(await vaultEncryptionKey(secret), config, vaultAad(vaultId));
}

export async function openVaultPayload<T = unknown>(secret: string, vaultId: string, blob: string): Promise<T> {
  if (!isSealedBlob(blob)) throw new Error("invalid_vault_payload");
  return open<T>(await vaultEncryptionKey(secret), blob, vaultAad(vaultId));
}

/** AAD for the member's re-encrypted workspace configuration (bound to the owner). */
export const workspaceConfigAad = (userId: string) => `rout.workspace.config.v1:${userId.toLowerCase()}`;

/** Commit request body. Strict: a raw secret or plaintext config is rejected, never stored. */
export const vaultCommitSchema = z.strictObject({
  vault_id: z.uuid(),
  claim_proof: z.string().regex(VAULT_PROOF_PATTERN),
  name: z.string().trim().min(1).max(80),
  slug_base: z.string().trim().toLowerCase().max(40).optional(),
  encrypted_config: z.string().refine(isSealedBlob, "encrypted_config must be client-side ciphertext"),
  key_id: z.string().regex(WORKSPACE_KEY_ID_PATTERN),
});
export type VaultCommitInput = z.infer<typeof vaultCommitSchema>;
