import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";
import { ledgerEnvelopeSchema as envelope, ledgerPublicKeySchema, ledgerKeyInputSchema } from "./key-validation";
export type { LedgerPublicKey } from "./key-validation";

export const getLedgerKeys = createServerFn({ method: "GET" }).middleware([requireAuth]).handler(async ({ context }) => {
  const { sql } = await import("@/lib/neon");
  const rows = await sql`select key_id, ledger_public_key, encrypted_ledger_private_key, retired_at from public.user_ledger_keys
    where user_id = ${context.userId} order by created_at desc limit 100`;
  return rows.map((r) => ({ key_id: String(r["key_id"]), ledger_public_key: ledgerPublicKeySchema.parse(r["ledger_public_key"]),
    encrypted_ledger_private_key: z.array(envelope).parse(r["encrypted_ledger_private_key"]), retired_at: r["retired_at"] ? String(r["retired_at"]) : null }));
});

/** Normal authenticated account access suffices to reset LOST ledger keys, not account credentials. */
export const saveLedgerKeys = createServerFn({ method: "POST" }).middleware([requireAuth])
  .inputValidator((d: unknown) => ledgerKeyInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    if (!data.envelopes.some((e) => e.source === "recovery")) throw new Error("Een lokale herstelcode is verplicht.");
    const { publicKeyId } = await import("./crypto");
    const keyId = await publicKeyId(data.publicKey);
    const { runBatch } = await import("@/lib/neon");
    await runBatch([
      { query: "select id from public.users where id = $1 for update", params: [context.userId] },
      { query: `select public.rout_merge_assert(coalesce((select key_id from public.user_ledger_keys where user_id = $1 and retired_at is null), '') = coalesce($2, ''), 'ledger_key_conflict')`, params: [context.userId, data.expectedKeyId] },
      { query: "update public.user_ledger_keys set retired_at = now() where user_id = $1 and retired_at is null", params: [context.userId] },
      { query: `insert into public.user_ledger_keys(user_id, key_id, ledger_public_key, encrypted_ledger_private_key) values ($1, $2, $3::jsonb, $4::jsonb)`, params: [context.userId, keyId, JSON.stringify(data.publicKey), JSON.stringify(data.envelopes)] },
    ]);
    return { keyId };
  });

export const listEncryptedLedger = createServerFn({ method: "GET" }).middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ cursor: z.object({ createdAt: z.string().datetime(), id: z.string().uuid() }).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { sql } = await import("@/lib/neon");
    const rows = await (data.cursor
      ? sql`select id, key_id, encrypted_payload, to_json(created_at) as created_at from public.user_encrypted_audit_logs
          where user_id = ${context.userId} and (created_at, id) < (${data.cursor.createdAt}::timestamptz, ${data.cursor.id}::uuid)
          order by created_at desc, id desc limit 50`
      : sql`select id, key_id, encrypted_payload, to_json(created_at) as created_at from public.user_encrypted_audit_logs
          where user_id = ${context.userId} order by created_at desc, id desc limit 50`);
    return rows.map((r) => ({ id: String(r["id"]), key_id: String(r["key_id"]), encrypted_payload: String(r["encrypted_payload"]), created_at: String(r["created_at"]) }));
  });