import { sql } from "@/lib/neon";
import { assetStatus, retentionFor, withinQuota } from "@/lib/asset-retention";
import {
  MAX_UPLOAD_BYTES,
  SHARE_TYPES,
  deleteObject,
  extFor,
  presignedGetUrl,
  putObject,
  sniffType,
  storageConfigured,
  type BucketKind,
} from "@/lib/storage/s3.server";

type Row = Record<string, unknown>;

async function tierOf(userId: string) {
  const rows = (await sql`select verified, is_paid, tier from public.profiles where id = ${userId} limit 1`) as Row[];
  const r = rows[0] ?? {};
  return { verified: Boolean(r["verified"]), isPro: Boolean(r["is_paid"]) || r["tier"] === "pro" };
}

async function usage(userId: string) {
  const rows = (await sql`select count(*)::int as files, coalesce(sum(file_size),0)::bigint as bytes
    from public.user_assets where user_id = ${userId}
      and (is_lifetime or expires_at is null or expires_at > now())`) as Row[];
  return { files: Number(rows[0]?.["files"] ?? 0), bytes: Number(rows[0]?.["bytes"] ?? 0) };
}

export async function listAssets(userId: string) {
  const [rows, tier, used] = await Promise.all([
    sql`select id, file_name, file_size, content_type, is_lifetime, expires_at, created_at, s3_key, bucket_kind
        from public.user_assets where user_id = ${userId} order by created_at desc limit 200` as Promise<Row[]>,
    tierOf(userId),
    usage(userId),
  ]);
  return {
    lifetime: tier.verified || tier.isPro,
    used,
    assets: rows.map((r) => {
      const expiresAt = r["expires_at"] ? new Date(String(r["expires_at"])).toISOString() : null;
      return {
        id: String(r["id"]),
        fileName: String(r["file_name"]),
        fileSize: Number(r["file_size"]),
        contentType: String(r["content_type"]),
        isLifetime: Boolean(r["is_lifetime"]),
        expiresAt,
        createdAt: new Date(String(r["created_at"])).toISOString(),
        ...assetStatus(expiresAt, Boolean(r["is_lifetime"])),
      };
    }),
  };
}

/** Shown in the upload toast when the active scope (e.g. a free workspace) has no storage left. */
import { STORAGE_QUOTA_MESSAGE } from "./entitlement-engine";
export { STORAGE_QUOTA_MESSAGE };

export async function uploadAsset(input: { userId: string; bytes: Uint8Array; fileName: string; days?: number }) {
  if (input.bytes.byteLength === 0) throw new Error("Het bestand is leeg.");
  // Scope quota first: a 0 MB scope is refused with the same answer whether or not storage is configured.
  const { checkActiveScopeUpload } = await import("./entitlement-engine.server");
  const scopeQuota = await checkActiveScopeUpload(input.userId, input.bytes.byteLength);
  if (!scopeQuota.ok) throw new Error(STORAGE_QUOTA_MESSAGE);
  if (!storageConfigured("client")) throw new Error("Opslag is nog niet ingesteld.");
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) throw new Error("Maximaal 5 MB per bestand.");
  const type = sniffType(input.bytes);
  if (!type || !(SHARE_TYPES as readonly string[]).includes(type)) throw new Error("Enkel JPG, PNG, WebP, GIF, PDF of MP3.");
  if (!withinQuota(await usage(input.userId), input.bytes.byteLength)) {
    throw new Error("Opslaglimiet bereikt (50 bestanden of 500 MB).");
  }
  const { isLifetime, expiresAt } = retentionFor(await tierOf(input.userId), input.days);
  const key = `users/${input.userId}/assets/${crypto.randomUUID()}.${extFor(type)}`;
  await putObject("client", key, input.bytes, { contentType: type, cacheControl: "private, max-age=0" });
  const name = input.fileName.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "bestand";
  await sql`insert into public.user_assets (user_id, s3_key, file_name, file_size, content_type, is_lifetime, expires_at)
    values (${input.userId}, ${key}, ${name}, ${input.bytes.byteLength}, ${type}, ${isLifetime}, ${expiresAt ? expiresAt.toISOString() : null})`;
  return { ok: true as const };
}

export async function assetDownloadUrl(userId: string, id: string) {
  const rows = (await sql`select s3_key, bucket_kind from public.user_assets where id = ${id} and user_id = ${userId}
    and (is_lifetime or expires_at is null or expires_at > now()) limit 1`) as Row[];
  if (!rows[0]) throw new Error("Bestand niet gevonden.");
  return presignedGetUrl(String(rows[0]["bucket_kind"]) as BucketKind, String(rows[0]["s3_key"]), 3600);
}

export async function deleteAsset(userId: string, id: string) {
  const rows = (await sql`select s3_key, bucket_kind from public.user_assets where id = ${id} and user_id = ${userId} limit 1`) as Row[];
  if (!rows[0]) throw new Error("Bestand niet gevonden.");
  await deleteObject(String(rows[0]["bucket_kind"]) as BucketKind, String(rows[0]["s3_key"]));
  await sql`delete from public.user_assets where id = ${id} and user_id = ${userId}`;
  return { ok: true as const };
}

export async function purgeExpiredAssets() {
  const { drainExpired } = await import("./storage/expiry-drain");
  const out = await drainExpired({
    batchSize: 500,
    fetchBatch: async (cursor, n) => {
      const rows = (cursor
        ? await sql`select id, s3_key, bucket_kind, to_json(expires_at) as exp from public.user_assets
            where is_lifetime = false and expires_at < now() and (expires_at, id::text) > (${cursor.expiresAt}::timestamptz, ${cursor.id})
            order by expires_at, id::text limit ${n}`
        : await sql`select id, s3_key, bucket_kind, to_json(expires_at) as exp from public.user_assets
            where is_lifetime = false and expires_at < now() order by expires_at, id::text limit ${n}`) as Row[];
      return rows.map((r) => ({ id: String(r["id"]), expiresAt: String(r["exp"]), key: String(r["s3_key"]), kind: String(r["bucket_kind"]) as BucketKind }));
    },
    // Storage first: a failed delete keeps the row, so the object is retried next run.
    remove: async (r) => {
      try {
        await deleteObject(r.kind, r.key);
      } catch (error) {
        console.warn("[assets] purge failed", r.id, error);
        throw error;
      }
      await sql`delete from public.user_assets where id = ${r.id}`;
    },
  });
  return { deletedCount: out.removed, failed: out.failed, more: out.more };
}
