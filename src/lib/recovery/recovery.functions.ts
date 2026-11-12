/**
 * Recovery vault (3-of-5) server boundary. The server stores only ciphertext,
 * per-shard commitments and at most 2 passkey-wrapped shards (enforced again
 * in the database). It never sees a shard or the vault key in plaintext.
 *
 * Changing the vault needs a fresh passkey step-up; reading the sealed vault
 * for a restore is rate limited and always e-mails the owner, because the
 * server cannot tell a practice run from a real restore.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

export const RECOVERY_RESTORES_PER_HOUR = 5;

/** Hash-chained security audit entry (security_audit_logs); never carries a shard, word or key. */
async function audit(userId: string, eventType: string, payload: Record<string, unknown> = {}) {
  const { recordSecurityEvent } = await import("@/lib/audit-log.server");
  await recordSecurityEvent({ eventType, userId, payload });
}

const vaultSchema = z.object({
  vaultId: z.string().regex(/^[0-9a-f]{32}$/),
  version: z.literal(1),
  threshold: z.literal(3),
  sealedMaster: z.string().regex(/^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{40,200}$/),
  commitments: z.array(z.string().regex(/^[0-9a-f]{64}$/)).length(5),
});

type VaultRow = { vault_id: string; version: number; threshold: number; sealed_master: string; commitments: string[]; created_at: string };
type ShardRow = { shard_index: number; credential: string; ciphertext: string };

async function loadVault(userId: string) {
  const { sql } = await import("@/lib/neon");
  const rows = (await sql`select * from public.rout_recovery_vault_get(${userId}::uuid)`) as VaultRow[];
  return rows[0] ?? null;
}

/** Status only: no sealed master, no commitments, no wrapped shards. */
export const getRecoveryStatus = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { sql } = await import("@/lib/neon");
    const vault = await loadVault(context.userId);
    const shards = vault ? ((await sql`select * from public.rout_recovery_shards_get(${context.userId}::uuid)`) as ShardRow[]) : [];
    const attempts = (await sql`select * from public.rout_recovery_attempts_list(${context.userId}::uuid)`) as { outcome: string; created_at: string }[];
    return {
      vault: vault ? { vaultId: vault.vault_id, createdAt: String(vault.created_at) } : null,
      serverSlots: shards.map((s) => Number(s.shard_index)),
      attempts: attempts.map((a) => ({ outcome: a.outcome, at: String(a.created_at) })),
    };
  });

/** Create or rotate. Rotation cascades away every old server-held shard. */
export const saveRecoveryVault = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ vault: vaultSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { requirePasskeyStepUp } = await import("@/lib/auth/step-up-guard.server");
    await requirePasskeyStepUp(context.userId, "recovery_vault");
    const { sql } = await import("@/lib/neon");
    const v = data.vault;
    await sql`select public.rout_recovery_vault_put(${context.userId}::uuid, ${v.vaultId}, ${v.sealedMaster}, ${JSON.stringify(v.commitments)}::jsonb)`;
    const { notifyUser } = await import("@/lib/notifications.server");
    await notifyUser(context.userId, "recovery_vault_changed", { action: "saved" });
    await audit(context.userId, "recovery_vault.saved", { vaultId: v.vaultId });
    return { ok: true as const };
  });

/** Stores one passkey-wrapped shard; the database refuses a third. */
export const saveSealedShard = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z.object({
      vaultId: z.string().regex(/^[0-9a-f]{32}$/),
      index: z.number().int().min(1).max(5),
      credential: z.string().min(8).max(1400).regex(/^[A-Za-z0-9+/=_-]+$/),
      ciphertext: z.string().regex(/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,400}$/),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requirePasskeyStepUp } = await import("@/lib/auth/step-up-guard.server");
    await requirePasskeyStepUp(context.userId, "recovery_vault");
    const { sql } = await import("@/lib/neon");
    try {
      await sql`select public.rout_recovery_shard_put(${context.userId}::uuid, ${data.vaultId}, ${data.index}::smallint, ${data.credential}, ${data.ciphertext})`;
    } catch {
      return { ok: false as const, error: "server_shard_limit" };
    }
    await audit(context.userId, "recovery_vault.shard_sealed", { vaultId: data.vaultId, index: data.index });
    return { ok: true as const };
  });

export const deleteRecoveryVault = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { requirePasskeyStepUp } = await import("@/lib/auth/step-up-guard.server");
    await requirePasskeyStepUp(context.userId, "recovery_vault");
    const { sql } = await import("@/lib/neon");
    await sql`select public.rout_recovery_vault_delete(${context.userId}::uuid)`;
    const { notifyUser } = await import("@/lib/notifications.server");
    await notifyUser(context.userId, "recovery_vault_changed", { action: "deleted" });
    await audit(context.userId, "recovery_vault.deleted");
    return { ok: true as const };
  });

/** Hands out the sealed vault for a restore or practice run. */
export const beginRecovery = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ practice: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { sql } = await import("@/lib/neon");
    const vault = await loadVault(context.userId);
    if (!vault) return { ok: false as const, error: "no_vault" };
    const rows = (await sql`select public.rout_recovery_attempt(${context.userId}::uuid, ${data.practice ? "practice" : "started"}) as recent`) as { recent: number }[];
    if (Number(rows[0]?.recent ?? 0) >= RECOVERY_RESTORES_PER_HOUR) {
      await audit(context.userId, "recovery_vault.rate_limited", { practice: data.practice });
      return { ok: false as const, error: "rate_limited" };
    }
    await audit(context.userId, data.practice ? "recovery_vault.practice_started" : "recovery_vault.restore_started", { vaultId: vault.vault_id });
    const shards = (await sql`select * from public.rout_recovery_shards_get(${context.userId}::uuid)`) as ShardRow[];
    const { notifyUser } = await import("@/lib/notifications.server");
    await notifyUser(context.userId, "recovery_attempt", { practice: data.practice });
    return {
      ok: true as const,
      vault: {
        vaultId: vault.vault_id,
        version: Number(vault.version),
        threshold: Number(vault.threshold),
        sealedMaster: vault.sealed_master,
        commitments: vault.commitments,
      },
      sealedShards: shards.map((s) => ({ index: Number(s.shard_index), credential: s.credential, ciphertext: s.ciphertext })),
    };
  });

export const finishRecovery = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ outcome: z.enum(["restored", "failed"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { sql } = await import("@/lib/neon");
    await sql`select public.rout_recovery_attempt(${context.userId}::uuid, ${data.outcome})`;
    await audit(context.userId, `recovery_vault.${data.outcome}`);
    return { ok: true as const };
  });
