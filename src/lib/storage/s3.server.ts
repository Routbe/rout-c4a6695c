import { AwsClient } from "aws4fetch";
import { storageFailureCode, storageNetworkCode } from "./storage-errors";

/**
 * Scaleway Object Storage (S3-compatible, fr-par).
 *
 * Three buckets, strictly separated:
 * - client   → member data: profile photos, app media, temporary QR files
 * - internal → ROUT's own assets: press kit, official logos (admins only)
 * - default  → general fallback
 *
 * Env is read lazily per call (Worker/Vercel inject it per request).
 */
export type BucketKind = "client" | "internal" | "default";

const BUCKET_ENV: Record<BucketKind, string> = {
  client: "SCALEWAY_CLIENT_BUCKET",
  internal: "SCALEWAY_INTERNAL_BUCKET",
  default: "SCALEWAY_DEFAULT_BUCKET",
};

export class StorageNotConfigured extends Error {
  constructor() {
    super("not_configured: Scaleway Object Storage — bestandsopslag is nog niet ingesteld (sleutels of bucket ontbreken). Uploaden, ook van video's, kan pas zodra die zijn toegevoegd.");
    this.name = "StorageNotConfigured";
  }
}

function config() {
  // Generic S3_* names (Vercel) are accepted as aliases of the SCALEWAY_* names.
  const accessKeyId = process.env["SCALEWAY_ACCESS_KEY"] || process.env["S3_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["SCALEWAY_SECRET_KEY"] || process.env["S3_SECRET_ACCESS_KEY"];
  const region = process.env["SCALEWAY_REGION"] || process.env["S3_REGION"] || "fr-par";
  const endpoint = (process.env["SCALEWAY_ENDPOINT"] || process.env["S3_ENDPOINT"] || `https://s3.${region}.scw.cloud`).replace(/\/$/, "");
  if (!accessKeyId || !secretAccessKey) return null;
  return { accessKeyId, secretAccessKey, region, endpoint };
}

export function storageConfigured(kind: BucketKind = "client"): boolean {
  return Boolean(config() && (process.env[BUCKET_ENV[kind]] || process.env["SCALEWAY_DEFAULT_BUCKET"] || process.env["S3_BUCKET_NAME"]));
}

function resolve(kind: BucketKind) {
  const cfg = config();
  const bucket = process.env[BUCKET_ENV[kind]] || process.env["SCALEWAY_DEFAULT_BUCKET"] || process.env["S3_BUCKET_NAME"];
  if (!cfg || !bucket) throw new StorageNotConfigured();
  const client = new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    region: cfg.region,
    service: "s3",
  });
  return { client, bucket, endpoint: cfg.endpoint, region: cfg.region };
}

function encodeKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

/** Public URL (virtual-hosted style) — only readable for objects uploaded with `publicRead`. */
export function publicUrl(kind: BucketKind, key: string): string {
  const { bucket, region } = resolve(kind);
  return `https://${bucket}.s3.${region}.scw.cloud/${encodeKey(key)}`;
}

export async function putObject(
  kind: BucketKind,
  key: string,
  body: Uint8Array,
  opts: { contentType: string; publicRead?: boolean; metadata?: Record<string, string>; cacheControl?: string },
): Promise<void> {
  const { client, bucket, endpoint } = resolve(kind);
  const headers: Record<string, string> = {
    "content-type": opts.contentType,
    "content-length": String(body.byteLength),
    "cache-control": opts.cacheControl ?? "public, max-age=31536000, immutable",
  };
  if (opts.publicRead) headers["x-amz-acl"] = "public-read";
  for (const [k, v] of Object.entries(opts.metadata ?? {})) headers[`x-amz-meta-${k}`] = v;
  let res: Response;
  try {
  res = await client.fetch(`${endpoint}/${bucket}/${encodeKey(key)}`, {
    method: "PUT",
    headers,
    body: body as BodyInit,
  });
  } catch (error) {
    console.error("[storage] PUT failed", { kind, code: storageNetworkCode(error) });
    throw new Error("Upload naar opslag mislukt: verbinding niet beschikbaar.");
  }
  if (!res.ok) {
    const text = await res.text();
    console.error("[storage] PUT failed", { kind, status: res.status, code: storageFailureCode(text) });
    throw new Error(`Upload naar opslag mislukt (${res.status}).`);
  }
}

export async function deleteObject(kind: BucketKind, key: string): Promise<void> {
  const { client, bucket, endpoint } = resolve(kind);
  const res = await client.fetch(`${endpoint}/${bucket}/${encodeKey(key)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    console.error(`[storage] DELETE ${bucket}/${key} failed [${res.status}]`);
    throw new Error(`Verwijderen uit opslag mislukt (${res.status}).`);
  }
}

/** First-party streaming: do not redirect a visitor to the storage provider. */
export async function getObject(kind: BucketKind, key: string): Promise<Response> {
  const { client, bucket, endpoint } = resolve(kind);
  return client.fetch(`${endpoint}/${bucket}/${encodeKey(key)}`, { method: "GET" });
}

/** Short-lived presigned GET for private objects. */
export async function presignedGetUrl(kind: BucketKind, key: string, expiresSeconds = 300): Promise<string> {
  const { client, bucket, endpoint } = resolve(kind);
  const url = new URL(`${endpoint}/${bucket}/${encodeKey(key)}`);
  url.searchParams.set("X-Amz-Expires", String(expiresSeconds));
  const signed = await client.sign(url.toString(), { method: "GET", aws: { signQuery: true } });
  return signed.url;
}

/* ------------------------------------------------------------ validation */

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const SHARE_TYPES = [...IMAGE_TYPES, "application/pdf", "audio/mpeg"] as const;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "audio/mpeg": "mp3",
};
export const extFor = (type: string) => EXT[type] ?? "bin";

/** Detects the real type from the first bytes; never trusts the client label. */
export function sniffType(b: Uint8Array): string | null {
  const s = (i: number, ...v: number[]) => v.every((x, j) => b[i + j] === x);
  if (s(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (s(0, 0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (s(0, 0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (s(0, 0x52, 0x49, 0x46, 0x46) && s(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  if (s(0, 0x25, 0x50, 0x44, 0x46)) return "application/pdf";
  if (s(0, 0x49, 0x44, 0x33) || s(0, 0xff, 0xfb) || s(0, 0xff, 0xf3) || s(0, 0xff, 0xf2)) return "audio/mpeg";
  return null;
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Short-lived presigned PUT so the browser uploads straight to storage. */
export async function presignedPutUrl(kind: BucketKind, key: string, contentType: string, expiresSeconds = 300): Promise<string> {
  const { client, bucket, endpoint } = resolve(kind);
  const url = new URL(`${endpoint}/${bucket}/${encodeKey(key)}`);
  url.searchParams.set("X-Amz-Expires", String(expiresSeconds));
  const signed = await client.sign(url.toString(), { method: "PUT", headers: { "content-type": contentType }, aws: { signQuery: true } });
  return signed.url;
}
