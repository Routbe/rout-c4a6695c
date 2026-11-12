import { sql } from "@/lib/neon";
import {
  MAX_UPLOAD_BYTES,
  SHARE_TYPES,
  deleteObject,
  extFor,
  presignedGetUrl,
  putObject,
  sniffType,
  storageConfigured,
} from "./s3.server";

/** Temporary files shared via QR code (client bucket, `users/<uid>/shared/…`). */
export const SHARE_DAYS = [1, 7, 30] as const;
const MAX_ACTIVE_PER_USER = 50;

type Row = Record<string, unknown>;

export async function createSharedFile(input: {
  userId: string;
  bytes: Uint8Array;
  fileName: string;
  days: number;
}): Promise<{ id: string; expiresAt: string }> {
  if (!storageConfigured("client")) throw new Error("Bestanden delen is nog niet ingesteld.");
  if (input.bytes.byteLength === 0) throw new Error("Het bestand is leeg.");
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) throw new Error("Maximaal 5 MB per bestand.");
  const type = sniffType(input.bytes);
  if (!type || !(SHARE_TYPES as readonly string[]).includes(type)) {
    throw new Error("Enkel JPG, PNG, WebP, GIF, PDF of MP3.");
  }
  const days = (SHARE_DAYS as readonly number[]).includes(input.days) ? input.days : 7;
  const active = (await sql`select count(*)::int as n from public.shared_files
    where user_id = ${input.userId} and expires_at > now()`) as Row[];
  if (Number(active[0]?.["n"] ?? 0) >= MAX_ACTIVE_PER_USER) {
    throw new Error(`Je hebt al ${MAX_ACTIVE_PER_USER} actieve gedeelde bestanden.`);
  }

  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
  const key = `users/${input.userId}/shared/${id}.${extFor(type)}`;
  await putObject("client", key, input.bytes, {
    contentType: type,
    cacheControl: "private, max-age=300",
    metadata: { "expires-at": expiresAt, "owner-id": input.userId },
  });
  const safeName = input.fileName.replace(/[^\w.\- ]+/g, "").slice(0, 120) || null;
  await sql`insert into public.shared_files (id, user_id, bucket_key, file_name, content_type, size_bytes, expires_at)
    values (${id}, ${input.userId}, ${key}, ${safeName}, ${type}, ${input.bytes.byteLength}, ${expiresAt})`;
  return { id, expiresAt };
}

/** Presigned URL while valid; `null` when unknown or expired. */
export async function resolveSharedFile(id: string): Promise<{ url: string } | { expired: true } | null> {
  const rows = (await sql`select bucket_key, expires_at from public.shared_files
    where id = ${id} limit 1`) as Row[];
  const row = rows[0];
  if (!row) return null;
  if (new Date(row["expires_at"] as string).getTime() <= Date.now()) return { expired: true };
  return { url: await presignedGetUrl("client", String(row["bucket_key"]), 300) };
}

/** Removes expired files from Scaleway first, then from the table. */
export async function purgeExpiredSharedFiles(limit = 200): Promise<{ removed: number; failed: number; more: boolean }> {
  const { drainExpired } = await import("./expiry-drain");
  return drainExpired({
    batchSize: limit,
    fetchBatch: async (cursor, n) => {
      const rows = (cursor
        ? await sql`select id, bucket_key, to_json(expires_at) as exp from public.shared_files
            where expires_at <= now() and (expires_at, id::text) > (${cursor.expiresAt}::timestamptz, ${cursor.id})
            order by expires_at, id::text limit ${n}`
        : await sql`select id, bucket_key, to_json(expires_at) as exp from public.shared_files
            where expires_at <= now() order by expires_at, id::text limit ${n}`) as Row[];
      return rows.map((r) => ({ id: String(r["id"]), expiresAt: String(r["exp"]), key: String(r["bucket_key"]) }));
    },
    // Storage first: if it fails the row stays, so the object is never orphaned.
    remove: async (r) => {
      await deleteObject("client", r.key);
      await sql`delete from public.shared_files where id = ${r.id}`;
    },
  });
}
