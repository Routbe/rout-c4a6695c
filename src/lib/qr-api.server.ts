// Shared helpers for the public QR API routes. Server-only.
import { MISSING_SECRET_BODY, isMissingSecretError } from "./api-secrets";
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export function randomId(len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

/** 503 + structured payload when a backend secret is missing, 500 otherwise. */
export function serverError(error: unknown) {
  if (isMissingSecretError(error)) return json(MISSING_SECRET_BODY, 503);
  return json({ error: "Server error" }, 500);
}

export function isValidHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function detectDevice(ua: string): string {
  const s = ua.toLowerCase();
  if (/ipad|tablet|kindle|playbook|silk/.test(s)) return "tablet";
  if (/mobi|iphone|android|phone|ipod|blackberry|opera mini/.test(s)) return "mobile";
  if (!s) return "unknown";
  return "desktop";
}

/** Coarse browser family from a user agent — never stored, derived on read. */
export function detectBrowser(ua: string | null | undefined): string {
  const s = (ua ?? "").toLowerCase();
  if (!s) return "Unknown";
  if (/edg\//.test(s)) return "Edge";
  if (/opr\/|opera/.test(s)) return "Opera";
  if (/samsungbrowser/.test(s)) return "Samsung Internet";
  if (/firefox|fxios/.test(s)) return "Firefox";
  if (/chrome|crios/.test(s)) return "Chrome";
  if (/safari/.test(s)) return "Safari";
  return "Other";
}

/** Coarse OS family from a user agent. */
export function detectOs(ua: string | null | undefined): string {
  const s = (ua ?? "").toLowerCase();
  if (!s) return "Unknown";
  if (/iphone|ipad|ipod/.test(s)) return "iOS";
  if (/android/.test(s)) return "Android";
  if (/mac os x|macintosh/.test(s)) return "macOS";
  if (/windows/.test(s)) return "Windows";
  if (/cros/.test(s)) return "ChromeOS";
  if (/linux/.test(s)) return "Linux";
  return "Other";
}

export function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return (
    req.headers.get("cf-connecting-ip")?.trim() || req.headers.get("x-real-ip")?.trim() || "unknown"
  );
}

/** Public base URL of this app, used to build redirect + file links. */
export function siteOrigin(req: Request): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}

export async function admin() {
  const { dbAdmin } = await import("@/lib/db/admin.server");
  return dbAdmin;
}

/** Allocate a slug that is not yet taken. */
export async function allocateSlug(db: Awaited<ReturnType<typeof admin>>): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = randomId(7);
    const { data: existing } = await db
      .from("tracked_qrs")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) return slug;
  }
  return null;
}
