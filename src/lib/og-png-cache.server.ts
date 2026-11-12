/**
 * Durable PNG cache for code-drawn share cards (profile + ask/donate/tip/booking).
 * Content-addressed: the key is SHA-256 of the exact SVG (avatar inlined), so a
 * profile edit yields a new card automatically and a cached card can never be
 * stale. Lives in the internal Scaleway bucket next to the page cards; without
 * storage the card is simply rendered every time.
 */
export const OG_PNG_CACHE_PREFIX = "brand/og-cards/v1/";

export async function ogCacheKey(svg: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(svg)));
  return `${OG_PNG_CACHE_PREFIX}${Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("")}.png`;
}

export async function cachedOgPng(svg: string, render: () => Promise<Uint8Array>): Promise<Uint8Array> {
  const s3 = await import("@/lib/storage/s3.server");
  if (!s3.storageConfigured("internal")) return render();
  const key = await ogCacheKey(svg);
  try {
    const hit = await s3.getObject("internal", key);
    if (hit.ok) return new Uint8Array(await hit.arrayBuffer());
  } catch (error) {
    console.error("[og-cache] lookup failed", error instanceof Error ? error.message : "unknown");
  }
  const png = await render();
  // Awaited so the card is really stored before the worker may be torn down.
  await s3.putObject("internal", key, png, { contentType: "image/png" }).catch((error: unknown) =>
    console.error("[og-cache] store failed", error instanceof Error ? error.message : "unknown"),
  );
  return png;
}
