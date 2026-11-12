import sharp from "sharp";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AwsClient } from "aws4fetch";
import { classifyOmniUrl, discoverOEmbed, omniMetaTag, parseOpenGraph, youtubeId } from "../src/lib/omni-ingest";
import { safeFetch } from "./fetch";
import { renderedMetadata, renderEnabled } from "./render";

export type ClaimedJob = { id: string; user_id: string; source_url: string; title_override: string | null; media_hint: string | null; lease_token: string };
export type PreparedMedia = { title: string; type: string; meta: string | null; cover: Uint8Array; kinetic: Uint8Array | null };
export function storage() {
  const accessKeyId = process.env.SCALEWAY_ACCESS_KEY;
  const secretAccessKey = process.env.SCALEWAY_SECRET_KEY;
  const bucket = process.env.SCALEWAY_CLIENT_BUCKET;
  const region = process.env.SCALEWAY_REGION || "fr-par";
  if (!accessKeyId || !secretAccessKey || !bucket) throw new Error("storage_not_configured");
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || bucket.includes("..")) throw new Error("invalid_storage_bucket");
  const endpoint = process.env.SCALEWAY_ENDPOINT || `https://s3.${region}.scw.cloud`;
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || !/^s3\.(fr-par|nl-ams|pl-waw)\.scw\.cloud$/.test(url.hostname)) throw new Error("non_sovereign_storage_endpoint");
  return { client: new AwsClient({ accessKeyId, secretAccessKey, region, service: "s3" }), base: `${url.origin}/${encodeURIComponent(bucket)}` };
}
export async function upload(key: string, bytes: Uint8Array, type: string) {
  const { client, base } = storage();
  const res = await client.fetch(`${base}/${key.split("/").map(encodeURIComponent).join("/")}`, {
    method: "PUT", headers: { "content-type": type, "cache-control": "private, max-age=300" }, body: bytes as BodyInit,
  });
  if (!res.ok) { await res.body?.cancel(); throw new Error(`storage_failed_${res.status}`); }
}
export async function removeObject(key: string) {
  const { client, base } = storage();
  const res = await client.fetch(`${base}/${key.split("/").map(encodeURIComponent).join("/")}`, { method: "DELETE" });
  await res.body?.cancel();
  if (!res.ok && res.status !== 404) throw new Error("storage_cleanup_failed");
}
export async function webm(bytes: Uint8Array): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), "rout-omni-"));
  try {
    const input = join(dir, "source"); const output = join(dir, "preview.webm");
    await writeFile(input, bytes);
    await new Promise<void>((resolve, reject) => {
      const child = spawn("ffmpeg", ["-nostdin", "-v", "error", "-protocol_whitelist", "file,pipe", "-i", input,
        "-t", "6", "-an", "-vf", "scale=640:360:force_original_aspect_ratio=decrease,fps=15", "-c:v", "libvpx-vp9",
        "-b:v", "400k", "-threads", "2", "-f", "webm", output], { stdio: "ignore", timeout: 60000, killSignal: "SIGKILL" });
      child.on("error", reject); child.on("exit", (code) => code === 0 ? resolve() : reject(new Error("video_conversion_failed")));
    });
    const result = await readFile(output);
    if (result.length > 4 * 1024 * 1024) throw new Error("too_large");
    return result;
  } finally { await rm(dir, { recursive: true, force: true }); }
}
export async function prepare(job: ClaimedJob): Promise<PreparedMedia> {
  const page = await safeFetch(job.source_url, 768 * 1024).catch(() => ({ bytes: Buffer.alloc(0), type: "", url: job.source_url }));
  let html = /html|xml/i.test(page.type) ? page.bytes.toString("utf8") : "";
  let og = parseOpenGraph(html, page.url);
  if ((!og.image || !og.title) && renderEnabled(job.source_url)) {
    try { html = await renderedMetadata(job.source_url); og = { ...og, ...Object.fromEntries(Object.entries(parseOpenGraph(html, job.source_url)).filter(([, value]) => value !== undefined)) }; }
    catch { /* Safe static metadata / explicit media hints remain available. */ }
  }
  const endpoint = discoverOEmbed(html, page.url);
  if (endpoint) {
    try {
      const value: unknown = JSON.parse((await safeFetch(endpoint, 64 * 1024)).bytes.toString("utf8"));
      if (!value || typeof value !== "object") throw new Error("invalid_oembed");
      const data = value as Record<string, unknown>;
      if (!og.title && typeof data.title === "string") og.title = data.title.slice(0, 150);
      if (!og.image && typeof data.thumbnail_url === "string") og.image = data.thumbnail_url;
      if (!og.type && data.type === "video") og.type = "video.other";
    } catch { /* Optional discovery; never embeds remote HTML or executes scripts. */ }
  }
  const yt = youtubeId(job.source_url);
  const candidates = [job.media_hint, og.image, yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : null].filter((v): v is string => Boolean(v));
  let cover: Uint8Array | null = null;
  for (const candidate of candidates) {
    try {
      const image = await safeFetch(candidate, 5 * 1024 * 1024);
      cover = await sharp(image.bytes, { limitInputPixels: 40_000_000, animated: false }).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      break;
    } catch { /* Try another safe, bounded image candidate. */ }
  }
  if (!cover) throw new Error("no_image");
  const type = classifyOmniUrl(job.source_url, og.type);
  let kinetic: Uint8Array | null = null;
  if (og.video && /\.(webm|mp4)(\?|$)/i.test(og.video)) {
    try { kinetic = await webm((await safeFetch(og.video, 4 * 1024 * 1024)).bytes); } catch { /* Static cover remains valid. */ }
  }
  const words = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  return { cover, kinetic, type, title: (job.title_override || og.title || new URL(page.url).hostname).slice(0, 150), meta: omniMetaTag(type, og.duration, words) ?? null };
}