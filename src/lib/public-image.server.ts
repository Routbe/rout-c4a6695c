import { validateOutboundUrl } from "./security/ssrf-guard.server";
import { cachedRemoteImage, limitedImageBody } from "./integrations/mastodon.server";

/** Optional persistent caching must not prevent the same protected server fetch. */
export async function readPublicImage(raw: string): Promise<Response> {
  try {
    const cached = await cachedRemoteImage(raw);
    if (cached.ok || cached.status !== 503) return cached;
    await cached.body?.cancel();
  } catch (error) {
    const status = error instanceof Error && "status" in error ? error.status : null;
    if (status === 400 || status === 413 || status === 415) throw error;
  }
  const signal = AbortSignal.timeout(8000);
  const target = await validateOutboundUrl(raw, signal);
  const upstream = await fetch(target, { redirect: "error", signal, headers: { accept: "image/jpeg,image/png,image/webp", "user-agent": "ROUT image proxy" } });
  if (!upstream.ok) return new Response("Image unavailable", { status: 502 });
  const bytes = await limitedImageBody(upstream);
  return new Response(bytes as BodyInit, { headers: {
    "content-type": (upstream.headers.get("content-type") ?? "").split(";")[0],
    "cache-control": "public, max-age=86400, s-maxage=86400",
    "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "content-security-policy": "default-src 'none'",
  } });
}