/**
 * Ephemeral vaults (db/0205). Every state change goes through the SECURITY
 * DEFINER `rout_ephemeral_vault_*` functions. The raw ephemeral secret exists
 * only in the provisioning response; it is never stored or logged.
 */
import { sql } from "@/lib/neon";
import type { SandboxContext } from "@/lib/agent/agent-sandbox.server";
import { generateEphemeralSecret, sealVaultPayload, vaultClaimProof, type VaultConfig } from "./ephemeral-vault";
import { hashClaimProof, verifyClaimProof } from "./vault-hash";

export async function createEphemeralVault(ctx: SandboxContext, config: VaultConfig) {
  const vaultId = crypto.randomUUID();
  const secret = generateEphemeralSecret();
  const payload = await sealVaultPayload(secret, vaultId, config);
  const vaultHash = await hashClaimProof(await vaultClaimProof(secret));
  const rows = (await sql`select to_char(public.rout_ephemeral_vault_create(
      ${vaultId}::uuid, ${ctx.keyHash}, ${vaultHash}, ${payload}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as expires_at`) as Array<{ expires_at: string }>;
  const expiresAt = rows[0]?.expires_at;
  if (!expiresAt) throw new Error("vault_create_failed");
  return { vaultId, secret, expiresAt };
}

export type VerifiedVault = { vaultHash: string; encryptedPayload: string; expiresAt: string };

/** Caller must run inside a signed-in DB context. Throws `vault_proof_invalid` on a wrong proof. */
export async function readVerifiedVault(vaultId: string, claimProof: string): Promise<VerifiedVault | null> {
  const rows = (await sql`select vault_hash, encrypted_payload, expires_at
      from public.rout_ephemeral_vault_read(${vaultId}::uuid)`) as Array<{ vault_hash: string; encrypted_payload: string; expires_at: string }>;
  const r = rows[0];
  if (!r) return null;
  if (!(await verifyClaimProof(claimProof, r.vault_hash))) throw new Error("vault_proof_invalid");
  return { vaultHash: r.vault_hash, encryptedPayload: r.encrypted_payload, expiresAt: String(r.expires_at) };
}

/** Atomic: E2EE workspace + Owner membership + hard delete of the vault. */
export async function commitEphemeralVault(input: {
  vaultId: string; vaultHash: string; name: string; slug: string; encryptedConfig: string; keyId: string;
}): Promise<{ workspaceId: string; slug: string }> {
  const rows = (await sql`select workspace_id, slug from public.rout_ephemeral_vault_commit(
      ${input.vaultId}::uuid, ${input.vaultHash}, ${input.name}, ${input.slug}, ${input.encryptedConfig}, ${input.keyId})`) as Array<{ workspace_id: string; slug: string }>;
  const r = rows[0];
  if (!r) throw new Error("vault_commit_failed");
  return { workspaceId: r.workspace_id, slug: r.slug };
}

export async function purgeExpiredEphemeralVaults(): Promise<number> {
  const rows = (await sql`select public.rout_purge_expired_ephemeral_vaults() as n`) as Array<{ n: number }>;
  return Number(rows[0]?.n ?? 0);
}
