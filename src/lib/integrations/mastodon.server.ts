import { validateOutboundUrl } from "@/lib/security/ssrf-guard.server";
import { putObject, presignedGetUrl, storageConfigured } from "@/lib/storage/s3.server";

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_TIMEOUT_MS = 3000;
export const IMAGE_CACHE_SECONDS = 86400;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const pending = new Map<string, Promise<Response>>();
const handles = new Map<string, { image: string; expires: number }>();

/** Cache account lookup as well as media; never expose provider URLs to browsers. */
export async function cachedMastodonAvatar(handle: string): Promise<Response> {
  const lookup = mastodonHandleUrl(handle);
  const { readPublicImage } = await import("../public-image.server");
  const key = lookup.href;
  const existing = handles.get(key);
  if (existing && existing.expires > Date.now()) return readPublicImage(existing.image);
  const signal = AbortSignal.timeout(IMAGE_TIMEOUT_MS);
  const safe = await validateOutboundUrl(lookup.href, signal);
  const response = await fetch(safe, { redirect: "error", signal, headers: { accept: "application/json" } });
  if (!response.ok) return new Response("Avatar unavailable", { status: 502 });
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty account response");
  let text = ""; let size = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 128 * 1024) { await reader.cancel(); throw new Error("Account response too large"); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  const account = JSON.parse(text) as { avatar_static?: unknown; avatar?: unknown };
  const image = typeof account.avatar_static === "string" ? account.avatar_static : account.avatar;
  if (typeof image !== "string") throw new Error("Missing avatar");
  const result = await readPublicImage(image);
  if (result.ok) {
    if (handles.size >= 1000) { const first = handles.keys().next().value; if (first) handles.delete(first); }
    handles.set(key, { image, expires: Date.now() + IMAGE_CACHE_SECONDS * 1000 });
  }
  return result;
}

export function mastodonHandleUrl(handle: string): URL {
  const match = /^@?([a-zA-Z0-9_.-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/.exec(handle);
  if (!match?.[1] || !match[2] || match[2].split(".").some(label => !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label))) {
    throw Object.assign(new Error("Invalid Mastodon handle"), { status: 400 });
  }
  return new URL(`https://${match[2].toLowerCase()}/api/v1/accounts/lookup?acct=${encodeURIComponent(match[1])}`);
}

export async function limitedImageBody(response: Response): Promise<Uint8Array> {
  if (!TYPES.has((response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase())) throw Object.assign(new Error("Unsupported image type"), { status: 415 });
  if (Number(response.headers.get("content-length") ?? 0) > IMAGE_MAX_BYTES) { await response.body?.cancel(); throw Object.assign(new Error("Image too large"), { status: 413 }); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty image");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > IMAGE_MAX_BYTES) { await reader.cancel(); throw Object.assign(new Error("Image too large"), { status: 413 }); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

/** Persistent object cache; no upstream request when cache storage is unavailable. */
export async function cachedRemoteImage(raw: string): Promise<Response> {
  const existing = pending.get(raw);
  if (existing) return (await existing).clone();
  const work = readOrFetchImage(raw);
  pending.set(raw, work);
  try { return (await work).clone(); } finally { pending.delete(raw); }
}

async function readOrFetchImage(raw: string): Promise<Response> {
  if (!storageConfigured("internal")) return new Response("Image cache unavailable", { status: 503 });
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const key = `remote-images/${Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("")}`;
  const cached = await fetch(await presignedGetUrl("internal", key), { redirect: "error", signal: AbortSignal.timeout(3000) });
  const modified = Date.parse(cached.headers.get("last-modified") ?? "");
  if (cached.ok && Number.isFinite(modified) && Date.now() - modified < IMAGE_CACHE_SECONDS * 1000) {
    const body = await limitedImageBody(cached);
    return imageResponse(body, cached.headers.get("content-type") ?? "image/png");
  }
  await cached.body?.cancel();
  if (!cached.ok && cached.status !== 404) {
    console.error("[avatar-cache] storage_read_rejected", { status: cached.status });
    return new Response("Image cache unavailable", { status: 503 });
  }
  const signal = AbortSignal.timeout(IMAGE_TIMEOUT_MS);
  const target = await validateOutboundUrl(raw, signal);
  const response = await fetch(target, { redirect: "error", signal, headers: { accept: "image/jpeg,image/png,image/webp", "user-agent": "ROUT image cache" } });
  if (!response.ok) return new Response("Image unavailable", { status: 502 });
  const bytes = await limitedImageBody(response);
  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  await putObject("internal", key, bytes, { contentType: type, cacheControl: `public, max-age=${IMAGE_CACHE_SECONDS}` });
  return imageResponse(bytes, type);
}

function imageResponse(bytes: Uint8Array, type: string): Response {
  return new Response(bytes as BodyInit, { headers: { "content-type": type, "cache-control": `public, max-age=${IMAGE_CACHE_SECONDS}`, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "content-security-policy": "default-src 'none'" } });
}