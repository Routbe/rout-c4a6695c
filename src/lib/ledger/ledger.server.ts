import { encryptLedgerEvent } from "./crypto";
/** Encrypt immediately; no plaintext queue or server-decrypt capability. */
export async function appendEncryptedUserEvent(userId: string, event: Record<string, unknown>) {
  const { sql, withDbContext } = await import("@/lib/neon");
  return withDbContext({ userId, workspaceId: null }, async () => {
    const rows = await sql`select key_id, ledger_public_key from public.user_ledger_keys where user_id = ${userId} and retired_at is null limit 1`.catch((error: unknown) => {
      if ((error as { code?: string }).code === "42P01") return []; // deploy before opt-in migration, no plaintext fallback
      throw error;
    });
    const row = rows[0];
    if (!row) return false; // opt-in only, never retain plaintext waiting for activation
    const encryptedPayload = await encryptLedgerEvent(row["ledger_public_key"] as JsonWebKey, event);
    await sql`insert into public.user_encrypted_audit_logs(user_id, key_id, encrypted_payload)
      values (${userId}, ${String(row["key_id"])}, ${encryptedPayload})`;
    return true;
  });
}