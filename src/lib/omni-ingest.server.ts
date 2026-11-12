/** Webserver: enqueue and owner-scoped reads only. Heavy work lives in worker/. */
import { sql } from "@/lib/neon";
import { galleryMediaUrl, type OmniJob } from "@/lib/omni-ingest";

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Only approved source hosts (OMNI_RENDER_HOSTS, same list the worker uses)
 * may be persisted as fetch destinations. Empty list = nothing allowed.
 */
export function isApprovedOmniSource(raw: string): boolean {
  let url: URL;
  try { url = new URL(raw); } catch { return false; }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const allowed = (process.env["OMNI_RENDER_HOSTS"] ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  return allowed.some((a) => host === a || host.endsWith(`.${a}`));
}

export async function enqueueOmniJob(input: {
  userId: string;
  source: "studio" | "webhook";
  url: string;
  title?: string;
  mediaUrl?: string;
}): Promise<string> {
  if (!isApprovedOmniSource(input.url) || (input.mediaUrl && !isApprovedOmniSource(input.mediaUrl))) {
    throw Object.assign(new Error("host_not_allowed"), { status: 400 });
  }
  const recent = (await sql`select count(*)::int as n from public.omni_jobs
    where user_id=${input.userId} and created_at > now() - interval '1 hour'`) as { n: number }[];
  if (Number(recent[0]?.n ?? 0) >= 60) throw Object.assign(new Error("rate_limited"), { status: 429 });
  const rows = (await sql`insert into public.omni_jobs (user_id, source, source_url, title_override, media_hint)
    values (${input.userId}, ${input.source}, ${input.url}, ${input.title || null}, ${input.mediaUrl || null}) returning id`) as { id: string }[];
  const id = rows[0]?.id;
  if (!id) throw new Error("job_not_created");
  return id;
}

export async function listOmniJobs(userId: string): Promise<OmniJob[]> {
  const rows = (await sql`select id, source, source_url, status, content_type, title, meta_tag, target_url,
    local_media_path, kinetic_preview_path, error, created_at from public.omni_jobs
    where user_id=${userId} order by created_at desc limit 30`) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r["id"]),
    source: r["source"] === "webhook" ? "webhook" : "studio",
    sourceUrl: String(r["source_url"]),
    status: r["status"] as OmniJob["status"],
    contentType: (r["content_type"] as OmniJob["contentType"]) ?? null,
    title: (r["title"] as string | null) ?? null,
    metaTag: (r["meta_tag"] as string | null) ?? null,
    targetUrl: (r["target_url"] as string | null) ?? null,
    mediaUrl: r["local_media_path"] ? galleryMediaUrl(String(r["local_media_path"])) : null,
    kineticPreviewUrl: r["kinetic_preview_path"] ? galleryMediaUrl(String(r["kinetic_preview_path"])) : null,
    error: (r["error"] as string | null) ?? null,
    createdAt: new Date(String(r["created_at"])).toISOString(),
  }));
}
