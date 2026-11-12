import { createServerFn } from "@tanstack/react-start";
import { cleanFeedHandle, htmlToText, isBlueskyHandle, splitMastodonHandle, SOCIAL_FEED_MAX_COUNT } from "./social-feed";

export type FeedPost = { id: string; text: string; url: string; createdAt: string; image: string | null };

const cache = new Map<string, { at: number; posts: FeedPost[] }>();
const TTL = 5 * 60_000;

/** Public posts of a Bluesky or Mastodon account (public APIs, no tokens, 5 min cache). */
export const getSocialFeed = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => {
    const r = (d ?? {}) as Record<string, unknown>;
    return {
      platform: r["platform"] === "mastodon" ? ("mastodon" as const) : ("bluesky" as const),
      handle: cleanFeedHandle(r["handle"]),
      count: Math.min(SOCIAL_FEED_MAX_COUNT, Math.max(1, Number(r["count"]) || 6)),
      profile: typeof r["profile"] === "string" ? r["profile"].slice(0, 64) : "",
      blockId: typeof r["blockId"] === "string" ? r["blockId"].slice(0, 100) : "",
    };
  })
  .handler(async ({ data }): Promise<{ posts: FeedPost[] }> => {
    const key = `${data.platform}:${data.platform === "mastodon" ? `${data.profile}:${data.blockId}:` : ""}${data.handle.toLowerCase()}:${data.count}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return { posts: hit.posts };
    let posts: FeedPost[] = [];
    try {
      if (data.platform === "bluesky") {
        if (!isBlueskyHandle(data.handle)) return { posts: [] };
        const res = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(data.handle)}&limit=${data.count}&filter=posts_no_replies`, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) return { posts: [] };
        const json = (await res.json()) as { feed?: { post: { uri: string; record?: { text?: string; createdAt?: string }; embed?: { images?: { thumb?: string }[] }; author?: { handle?: string } } }[] };
        posts = (json.feed ?? []).map(({ post }) => {
          const rkey = post.uri.split("/").pop() ?? "";
          const thumb = post.embed?.images?.[0]?.thumb ?? null;
          return {
            id: post.uri,
            text: (post.record?.text ?? "").slice(0, 600),
            url: `https://bsky.app/profile/${post.author?.handle ?? data.handle}/post/${rkey}`,
            createdAt: post.record?.createdAt ?? "",
            image: thumb && thumb.startsWith("https://cdn.bsky.app/") ? thumb : null,
          };
        });
      } else {
        // Mastodon hosts vary per account: only contact an instance named in a
        // social-feed block the owner published on a public profile.
        if (!data.profile || !data.blockId) return { posts: [] };
        const { findPublicBlock } = await import("./public-block.server");
        const block = await findPublicBlock(data.profile, data.blockId, "social_feed");
        if (!block) return { posts: [] };
        const { parseSocialFeedConfig } = await import("./social-feed");
        const published = parseSocialFeedConfig(block.value);
        if (published.platform !== "mastodon" || published.handle.toLowerCase() !== data.handle.toLowerCase()) return { posts: [] };
        const parts = splitMastodonHandle(published.handle);
        if (!parts) return { posts: [] };
        const { isPublicHost } = await import("./open-web-rules");
        if (!isPublicHost(parts.instance)) return { posts: [] };
        const base = `https://${parts.instance}/api/v1`;
        const look = await fetch(`${base}/accounts/lookup?acct=${encodeURIComponent(parts.user)}`, { signal: AbortSignal.timeout(6000), redirect: "error" });
        if (!look.ok) return { posts: [] };
        const acct = (await look.json()) as { id?: string };
        if (!acct.id || !/^\w+$/.test(acct.id)) return { posts: [] };
        const res = await fetch(`${base}/accounts/${acct.id}/statuses?limit=${data.count}&exclude_replies=true&exclude_reblogs=true`, { signal: AbortSignal.timeout(6000), redirect: "error" });
        if (!res.ok) return { posts: [] };
        const list = (await res.json()) as { id: string; content?: string; url?: string; created_at?: string; sensitive?: boolean; media_attachments?: { type?: string; preview_url?: string }[] }[];
        posts = list.map((s) => ({
          id: s.id,
          text: htmlToText(s.content ?? "").slice(0, 600),
          url: typeof s.url === "string" && s.url.startsWith(`https://${parts.instance}/`) ? s.url : `https://${parts.instance}/@${parts.user}`,
          createdAt: s.created_at ?? "",
          // First public, non-sensitive photo; the card loads it only through the privacy proxy.
          image: !s.sensitive
            ? (s.media_attachments ?? []).find((m) => m.type === "image" && typeof m.preview_url === "string" && m.preview_url.startsWith("https://"))?.preview_url ?? null
            : null,
        }));
      }
    } catch (error) {
      console.warn("[social-feed] fetch failed", data.platform, error instanceof Error ? error.message : "unknown");
      return { posts: [] };
    }
    cache.set(key, { at: Date.now(), posts });
    return { posts };
  });
