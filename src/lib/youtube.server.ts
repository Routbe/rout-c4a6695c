/**
 * YouTube vault (server-only).
 *
 * Flow: /api/youtube/start → Google consent (youtube.readonly, offline) →
 * /api/public/youtube/callback → tokens sealed on the user_integrations row
 * for provider 'youtube' (db/95). Reuses the Google sign-in client keys but
 * never touches Better Auth. Tokens are never logged or returned.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { sql } from "@/lib/neon";
import { encryptionConfigured, open, seal } from "@/lib/crypto/secretbox.server";
import type { YouTubeCard } from "@/lib/youtube-format";
import { resolveOrigin } from "@/lib/spotify-presence.server";

const SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
const STATE_TTL_MS = 10 * 60 * 1000;
const CARD_FRESH_MS = 30 * 60 * 1000;

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}
const clientId = () =>
  env("GOOGLE_CLIENT_ID") ?? env("GOOGLE_OAUTH_CLIENT_ID") ?? env("AUTH_GOOGLE_ID") ?? env("GOOGLE_ID");
const clientSecret = () =>
  env("GOOGLE_CLIENT_SECRET") ?? env("GOOGLE_OAUTH_CLIENT_SECRET") ?? env("AUTH_GOOGLE_SECRET") ?? env("GOOGLE_SECRET");

export function youtubeConfigured(): boolean {
  return Boolean(clientId() && clientSecret() && encryptionConfigured());
}

export function youtubeMissingKeys(): string[] {
  const out: string[] = [];
  if (!clientId()) out.push("GOOGLE_CLIENT_ID");
  if (!clientSecret()) out.push("GOOGLE_CLIENT_SECRET");
  if (!encryptionConfigured()) out.push("PSP_ENCRYPTION_KEY");
  return out;
}

export function youtubeRedirectUri(origin?: Request | string): string {
  const resolved = resolveOrigin(origin);
  const base = /(^|\.)rout\.be$/i.test(new URL(resolved).hostname) ? "https://rout.be" : resolved.replace(/\/$/, "");
  return `${base}/api/public/youtube/callback`;
}

const mac = (p: string) => createHmac("sha256", clientSecret()!).update(`yt:${p}`).digest("hex").slice(0, 32);

export function signYouTubeState(userId: string, now = Date.now()): string {
  const p = `youtube.${userId}.${now}`;
  return `${p}.${mac(p)}`;
}

export function verifyYouTubeState(state: string, now = Date.now()): string | null {
  const parts = state.split(".");
  if (parts.length !== 4 || parts[0] !== "youtube") return null;
  const [, userId, ts, sig] = parts as [string, string, string, string];
  const issued = Number(ts);
  if (!Number.isFinite(issued) || now - issued > STATE_TTL_MS || issued > now + 60_000) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(mac(`youtube.${userId}.${ts}`));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return userId;
}

export function youtubeAuthorizeUrl(userId: string, origin?: Request | string): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: clientId()!,
    scope: SCOPE,
    redirect_uri: youtubeRedirectUri(origin),
    state: signYouTubeState(userId),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

type TokenSet = { access_token: string; refresh_token?: string; expires_in: number };

async function tokenRequest(body: URLSearchParams): Promise<TokenSet> {
  body.set("client_id", clientId()!);
  body.set("client_secret", clientSecret()!);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`youtube_token_${res.status}`);
  return (await res.json()) as TokenSet;
}

const aad = (userId: string, kind: string) => `youtube:${kind}:${userId}`;

async function storeTokens(userId: string, t: TokenSet, handle?: string) {
  const a = await seal(t.access_token, aad(userId, "access"));
  const r = t.refresh_token ? await seal(t.refresh_token, aad(userId, "refresh")) : null;
  const expires = new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString();
  await sql`
    insert into public.user_integrations
      (user_id, provider, handle, verified, access_token_enc, access_token_iv, refresh_token_enc, refresh_token_iv, token_expires_at, connection_status)
    values (${userId}, 'youtube', ${handle ?? "youtube"}, true, ${a.ciphertext}, ${a.iv}, ${r?.ciphertext ?? null}, ${r?.iv ?? null}, ${expires}, 'connected')
    on conflict (user_id, provider) do update set
      handle = coalesce(${handle ?? null}, user_integrations.handle),
      verified = true,
      access_token_enc = excluded.access_token_enc,
      access_token_iv = excluded.access_token_iv,
      refresh_token_enc = coalesce(excluded.refresh_token_enc, user_integrations.refresh_token_enc),
      refresh_token_iv = coalesce(excluded.refresh_token_iv, user_integrations.refresh_token_iv),
      token_expires_at = excluded.token_expires_at,
      connection_status = 'connected',
      updated_at = now()`;
}

export async function exchangeYouTubeCode(userId: string, code: string, origin?: Request | string) {
  const t = await tokenRequest(
    new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: youtubeRedirectUri(origin) }),
  );
  await storeTokens(userId, t);
  // Prime the card so the Studio preview is instant; failures are non-fatal.
  await refreshCard(userId).catch(() => null);
  void subscribeYouTubePush(userId, origin).catch(() => false);
}

/** Valid access token, refreshing when expired; marks the link disconnected when refresh fails. */
export async function youtubeAccessToken(userId: string, forceRefresh = false): Promise<string | null> {
  const rows = await sql`select access_token_enc, access_token_iv, refresh_token_enc, refresh_token_iv, token_expires_at, connection_status
    from public.user_integrations where user_id = ${userId} and provider = 'youtube'`;
  const row = rows[0] as Record<string, string | null> | undefined;
  if (!row?.["access_token_enc"] || row["connection_status"] === "disconnected") return null;
  if (!forceRefresh && row["token_expires_at"] && new Date(row["token_expires_at"]).getTime() > Date.now()) {
    return open(row["access_token_enc"], row["access_token_iv"]!, aad(userId, "access"));
  }
  try {
    if (!row["refresh_token_enc"]) throw new Error("no_refresh_token");
    const refresh = await open(row["refresh_token_enc"], row["refresh_token_iv"]!, aad(userId, "refresh"));
    const t = await tokenRequest(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh }));
    await storeTokens(userId, t);
    return t.access_token;
  } catch (e) {
    console.warn("[youtube] refresh failed:", e instanceof Error ? e.message : "unknown");
    await sql`update public.user_integrations set connection_status = 'disconnected', updated_at = now()
      where user_id = ${userId} and provider = 'youtube'`;
    return null;
  }
}

const num = (v: unknown) => (v == null || v === "" ? null : Number(v));

async function ytGet(userId: string, path: string): Promise<Record<string, any> | null> {
  let token = await youtubeAccessToken(userId);
  if (!token) return null;
  const call = (t: string) =>
    fetch(`https://www.googleapis.com/youtube/v3/${path}`, {
      headers: { Authorization: `Bearer ${t}` },
      signal: AbortSignal.timeout(8000),
    });
  let res = await call(token);
  if (res.status === 401) {
    token = await youtubeAccessToken(userId, true);
    if (!token) return null;
    res = await call(token);
  }
  if (!res.ok) throw new Error(`youtube_api_${res.status}`);
  return (await res.json()) as Record<string, any>;
}

/** Fetches channel + 3 latest public videos from the API and caches the card. */
export async function refreshCard(userId: string): Promise<YouTubeCard | null> {
  const ch = await ytGet(userId, "channels?part=snippet,statistics&mine=true");
  const item = ch?.["items"]?.[0];
  if (!item) return null;
  const id = String(item.id);
  const vids = await ytGet(
    userId,
    `search?part=snippet&channelId=${encodeURIComponent(id)}&order=date&type=video&maxResults=3`,
  ).catch(() => null);
  const card: YouTubeCard = {
    channelId: id,
    title: String(item.snippet?.title ?? "YouTube").slice(0, 120),
    avatar: item.snippet?.thumbnails?.default?.url ?? null,
    url: item.snippet?.customUrl
      ? `https://www.youtube.com/${item.snippet.customUrl}`
      : `https://www.youtube.com/channel/${id}`,
    subscribers: item.statistics?.hiddenSubscriberCount ? null : num(item.statistics?.subscriberCount),
    views: num(item.statistics?.viewCount),
    videoCount: num(item.statistics?.videoCount),
    videos: ((vids?.["items"] ?? []) as any[]).slice(0, 3).map((v) => ({
      id: String(v.id?.videoId ?? ""),
      title: String(v.snippet?.title ?? "").slice(0, 160),
      thumb: v.snippet?.thumbnails?.medium?.url ?? null,
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(String(v.id?.videoId ?? ""))}`,
    })).filter((v) => v.id),
  };
  await sql`update public.user_integrations set youtube_card_json = ${JSON.stringify(card)}::jsonb,
      youtube_card_at = now(), handle = ${card.url.replace("https://www.youtube.com/", "").slice(0, 200)}, updated_at = now()
    where user_id = ${userId} and provider = 'youtube'`;
  return card;
}

/** Cached card (≤30 min old) for the owner; refreshes when stale. */
export async function cachedCard(userId: string): Promise<YouTubeCard | null> {
  const rows = await sql`select youtube_card_json, youtube_card_at from public.user_integrations
    where user_id = ${userId} and provider = 'youtube'`;
  const r = rows[0] as { youtube_card_json: YouTubeCard | null; youtube_card_at: string | null } | undefined;
  if (!r) return null;
  if (r.youtube_card_json && r.youtube_card_at && Date.now() - new Date(r.youtube_card_at).getTime() < CARD_FRESH_MS) {
    return r.youtube_card_json;
  }
  return (await refreshCard(userId).catch(() => null)) ?? r.youtube_card_json ?? null;
}

export type MyYouTube = {
  ready: boolean;
  connected: boolean;
  status: "connected" | "disconnected" | "none";
  visible: boolean;
  card: YouTubeCard | null;
};

export async function myYouTube(userId: string): Promise<MyYouTube> {
  const ready = youtubeConfigured();
  const rows = await sql`select visible, connection_status, access_token_enc is not null as has_token
    from public.user_integrations where user_id = ${userId} and provider = 'youtube'`;
  const r = rows[0] as { visible: boolean; connection_status: string | null; has_token: boolean } | undefined;
  if (!r?.has_token) return { ready, connected: false, status: "none", visible: false, card: null };
  const disconnected = r.connection_status === "disconnected";
  return {
    ready,
    connected: !disconnected,
    status: disconnected ? "disconnected" : "connected",
    visible: r.visible,
    card: disconnected ? null : await cachedCard(userId).catch(() => null),
  };
}

export async function setYouTubeVisible(userId: string, visible: boolean) {
  await sql`update public.user_integrations set visible = ${visible}, updated_at = now()
    where user_id = ${userId} and provider = 'youtube'`;
}

/** Revokes at Google (best effort) and physically deletes the row. */
export async function disconnectYouTube(userId: string) {
  const token = await youtubeAccessToken(userId).catch(() => null);
  if (token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }).catch(() => null);
  }
  await sql`delete from public.user_integrations where user_id = ${userId} and provider = 'youtube'`;
}

/** Public lookup: owner of a handle, only when visible, linked and the profile is public. */
export async function publicYouTubeOwner(handle: string): Promise<string | null> {
  const rows = await sql`
    select i.user_id from public.user_integrations i
    join public.profiles p on p.id = i.user_id
    where i.provider = 'youtube' and i.visible = true and i.access_token_enc is not null
      and coalesce(i.connection_status, 'connected') = 'connected'
      and lower(p.username) = lower(${handle})
      and coalesce((p.display_prefs ->> 'publicProfile')::boolean, true)
    limit 1`;
  return (rows[0]?.["user_id"] as string | undefined) ?? null;
}

// ---- Live presence (PubSubHubbub push, 15-minute TTL) ----

async function hubServerSecret(): Promise<string> {
  const { resolveAuthSecret } = await import("@/lib/better-auth.server");
  const s = resolveAuthSecret();
  if (!s) throw new Error("hub_secret_unavailable");
  return s.secret;
}

/** Subscribes the owner's channel feed at YouTube's hub (fire-and-forget on connect). */
export async function subscribeYouTubePush(userId: string, origin?: Request | string): Promise<boolean> {
  const { YOUTUBE_HUB_URL, feedTopic, hubSecret } = await import("./youtube-presence");
  const rows = (await sql`select youtube_card_json->>'channelId' as cid from public.user_integrations
    where user_id = ${userId} and provider = 'youtube'`) as { cid: string | null }[];
  const channelId = rows[0]?.cid;
  if (!channelId) return false;
  const base = new URL(youtubeRedirectUri(origin)).origin;
  const body = new URLSearchParams({
    "hub.mode": "subscribe",
    "hub.topic": feedTopic(channelId),
    "hub.callback": `${base}/api/public/youtube/push?t=${hubSecret(await hubServerSecret(), `cb:${channelId}`).slice(0, 32)}`,
    "hub.secret": hubSecret(await hubServerSecret(), channelId),
    "hub.lease_seconds": String(10 * 24 * 3600),
  });
  const res = await fetch(YOUTUBE_HUB_URL, { method: "POST", body, signal: AbortSignal.timeout(8000) });
  if (!res.ok && res.status !== 202) console.warn(`[youtube-push] subscribe ${res.status}`);
  return res.ok || res.status === 202;
}

/** True when the topic belongs to a connected channel (hub verify challenge). */
/** Verifies the per-channel callback token; no DB lookup, so nobody can probe which channels are linked. */
export async function isKnownYouTubeTopic(topic: string, token = ""): Promise<boolean> {
  const cid = /channel_id=([\w-]{10,40})/.exec(topic)?.[1];
  if (!cid) return false;
  const { hubSecret } = await import("./youtube-presence");
  const want = hubSecret(await hubServerSecret(), `cb:${cid}`).slice(0, 32);
  if (token.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ token.charCodeAt(i);
  if (diff !== 0) return false;
  const rows = await sql`select 1 from public.user_integrations
    where provider = 'youtube' and youtube_card_json->>'channelId' = ${cid} limit 1`;
  return rows.length > 0;
}

/** Handles a signed hub push: confirms live state via the owner's API token and stores it. */
export async function handleYouTubePush(body: string, signature: string | null): Promise<number> {
  const p = await import("./youtube-presence");
  const entries = p.parseYouTubeFeed(body);
  const first = entries[0];
  if (!first) return 204;
  if (!p.verifyHubSignature(body, signature, p.hubSecret(await hubServerSecret(), first.channelId))) return 403;
  const rows = (await sql`select user_id from public.user_integrations
    where provider = 'youtube' and youtube_card_json->>'channelId' = ${first.channelId} limit 1`) as { user_id: string }[];
  const userId = rows[0]?.user_id;
  if (!userId) return 204;
  const v = await ytGet(userId, `videos?part=snippet&id=${encodeURIComponent(first.videoId)}`).catch(() => null);
  const isLive = v?.["items"]?.[0]?.snippet?.liveBroadcastContent === "live";
  const presence = { isLive, videoId: first.videoId, title: first.title };
  await sql`update public.user_integrations set youtube_presence = ${JSON.stringify(presence)}::jsonb,
      youtube_presence_at = now() where user_id = ${userId} and provider = 'youtube'`;
  // New upload: refresh the cached card so "latest video" is current.
  void refreshCard(userId).catch(() => null);
  return 204;
}

/** Stored presence with the 15-minute TTL applied (stale "live" becomes offline). */
export async function youtubePresence(userId: string) {
  const { effectivePresence } = await import("./youtube-presence");
  const rows = (await sql`select youtube_presence, youtube_presence_at from public.user_integrations
    where user_id = ${userId} and provider = 'youtube'`) as { youtube_presence: never; youtube_presence_at: string | null }[];
  return effectivePresence(rows[0]?.youtube_presence ?? null, rows[0]?.youtube_presence_at ?? null);
}
