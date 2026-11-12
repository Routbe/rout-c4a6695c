/**
 * Security audit log writer + daily checkpoint (db/0127). Never sends data anywhere
 * except the database and structured stdout.
 */
import { sql, runBatch } from "@/lib/neon";
import { AUDIT_RETENTION_DAYS, checkpointMessage, hmacSha256Hex, sha256Hex } from "@/lib/audit-chain";

export interface SecurityEvent {
  eventType: string;
  userId?: string | null;
  actorId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  payload?: Record<string, unknown>;
}

/**
 * Visitor IP/user-agent hashes use a server-only key: the dedicated audit secret,
 * else a domain-separated derivation of the auth secret. Without either, the
 * values are not stored at all (a public fallback key would make them reversible).
 */
async function auditSalt(): Promise<string | null> {
  const dedicated = process.env["ROUT_AUDIT_SIGNING_SECRET"];
  if (dedicated) return dedicated;
  const auth = process.env["BETTER_AUTH_SECRET"];
  if (auth) return hmacSha256Hex(auth, "rout-audit-visitor-salt-v1");
  return null;
}

async function salted(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  const salt = await auditSalt();
  if (!salt) return null;
  return (await hmacSha256Hex(salt, value)).slice(0, 32);
}

/** Records an event; never throws (auditing must not block the action it records). */
export async function recordSecurityEvent(e: SecurityEvent): Promise<void> {
  try {
    await sql`
      insert into public.security_audit_logs
        (event_type, user_id, actor_id, ip_hash, user_agent_hash, payload_json, prev_hash, current_hash)
      values (${e.eventType}, ${e.userId ?? null}, ${e.actorId ?? e.userId ?? null},
              ${await salted(e.ip)}, ${await salted(e.userAgent)},
              ${JSON.stringify(e.payload ?? {})}::jsonb, '', '')`;
  } catch (err) {
    console.warn("[audit] write failed", { eventType: e.eventType, error: (err as Error).message });
  }
}

/** Signs the chain head for `day` (UTC, YYYY-MM-DD), stores it and prints it to stdout. */
export async function createDailyCheckpoint(day: string) {
  const secret = process.env["ROUT_AUDIT_SIGNING_SECRET"];
  if (!secret) throw new Error("ROUT_AUDIT_SIGNING_SECRET missing");
  const rows = (await sql`
    select id, current_hash, (select count(*) from public.security_audit_logs
      where created_at < (${day}::date + 1)) as n
    from public.security_audit_logs where created_at < (${day}::date + 1)
    order by id desc limit 1`) as { id: string; current_hash: string; n: string }[];
  const head = rows[0];
  const cp = {
    day,
    lastId: head ? Number(head.id) : 0,
    lastHash: head?.current_hash ?? (await sha256Hex("empty")),
    rowCount: head ? Number(head.n) : 0,
  };
  const signature = await hmacSha256Hex(secret, checkpointMessage(cp));
  await sql`
    insert into public.security_audit_checkpoints (day, last_id, last_hash, row_count, signature)
    values (${day}, ${cp.lastId}, ${cp.lastHash}, ${cp.rowCount}, ${signature})
    on conflict (day) do nothing`;
  console.log(JSON.stringify({ type: "rout.audit.checkpoint", ...cp, signature }));
  return { ...cp, signature };
}

/** Removes rows older than the retention window; checkpoints are kept forever. */
export async function purgeExpiredAuditRows(): Promise<number> {
  const [, res] = await runBatch(
    [
      { query: "select set_config('rout.audit_retention', 'on', true)", params: [] },
      {
        query: `delete from public.security_audit_logs where created_at < now() - ($1 || ' days')::interval`,
        params: [String(AUDIT_RETENTION_DAYS)],
      },
    ],
    { withContext: false },
  );
  return res?.rowCount ?? 0;
}
