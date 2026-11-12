import { reasonFromStatus, type SpotifyReason } from "./spotify-status-rules";
/**
 * Spotify Live Presence (server-only).
 *
 * Flow: /api/spotify/start → Spotify consent → /api/public/spotify/callback
 * → tokens sealed in `user_presence_connections`. `nowPlaying()` refreshes the
 * access token when needed and returns only public track info.
 *
 * Env: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, PSP_ENCRYPTION_KEY,
 *      PUBLIC_SITE_URL (redirect base, default https://rout.be).
 */
import { createHmac, timingSafeEqual } from "crypto";
import { sql } from "@/lib/neon";
import { encryptionConfigured, open, seal } from "@/lib/crypto/secretbox.server";

const SCOPES = "user-read-currently-playing user-read-playback-state";
const STATE_TTL_MS = 10 * 60 * 1000;

export function spotifyConfigured(): boolean {
  return Boolean(process.env["SPOTIFY_CLIENT_ID"] && process.env["SPOTIFY_CLIENT_SECRET"] && encryptionConfigured());
}

export function spotifyMissingKeys(): string[] {
  const out: string[] = [];
  if (!process.env["SPOTIFY_CLIENT_ID"]) out.push("SPOTIFY_CLIENT_ID");
  if (!process.env["SPOTIFY_CLIENT_SECRET"]) out.push("SPOTIFY_CLIENT_SECRET");
  if (!encryptionConfigured()) out.push("PSP_ENCRYPTION_KEY");
  return out;
}

const LOCAL = /^(localhost|127\.0\.0\.1)(:\d+)?$/;

/** Proxy-aware origin: non-local hosts are always https (TLS ends before the function). */
export function resolveOrigin(input?: Request | string): string {
  if (typeof input === "string" && input.trim()) {
    const u = new URL(input.startsWith("http") ? input : `https://${input}`);
    return `${LOCAL.test(u.host) ? u.protocol : "https:"}//${u.host}`;
  }
  if (input && typeof input === "object" && "headers" in input) {
    const fwdHost = input.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = fwdHost || input.headers.get("host") || new URL(input.url).host;
    const fwdProto = input.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
    return `${LOCAL.test(host) ? fwdProto || "http" : "https"}://${host}`;
  }
  return (process.env["PUBLIC_SITE_URL"] ?? "https://rout.be").replace(/\/$/, "");
}

export function spotifyRedirectUri(origin?: Request | string): string {
  const resolved = resolveOrigin(origin);
  const base = /(^|\.)rout\.be$/i.test(new URL(resolved).hostname) ? "https://rout.be" : resolved.replace(/\/$/, "");
  return `${base}/api/public/spotify/callback`;
}

function mac(payload: string): string {
  return createHmac("sha256", process.env["SPOTIFY_CLIENT_SECRET"]!).update(payload).digest("hex").slice(0, 32);
}

export function signSpotifyState(userId: string, now = Date.now()): string {
  const payload = `spotify.${userId}.${now}`;
  return `${payload}.${mac(payload)}`;
}

export function verifySpotifyState(state: string, now = Date.now()): string | null {
  const parts = state.split(".");
  if (parts.length !== 4 || parts[0] !== "spotify") return null;
  const [, userId, ts, sig] = parts as [string, string, string, string];
  const issued = Number(ts);
  if (!Number.isFinite(issued) || now - issued > STATE_TTL_MS || issued > now + 60_000) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(mac(`spotify.${userId}.${ts}`));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return userId;
}

export function spotifyAuthorizeUrl(userId: string, origin?: Request | string): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: process.env["SPOTIFY_CLIENT_ID"]!,
    scope: SCOPES,
    redirect_uri: spotifyRedirectUri(origin),
    state: signSpotifyState(userId),
    // Always show the consent screen so a silent browser session can't skip the grant.
    show_dialog: "true",
  });
  return `https://accounts.spotify.com/authorize?${p}`;
}

function basicAuth(): string {
  return `Basic ${btoa(`${process.env["SPOTIFY_CLIENT_ID"]}:${process.env["SPOTIFY_CLIENT_SECRET"]}`)}`;
}

async function tokenRequest(body: URLSearchParams) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`spotify_token_${res.status}`);
  return (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
}

const aad = (userId: string, kind: string) => `spotify:${kind}:${userId}`;

async function store(userId: string, t: { access_token: string; refresh_token?: string; expires_in: number }, accountName?: string | null) {
  const a = await seal(t.access_token, aad(userId, "access"));
  const r = t.refresh_token ? await seal(t.refresh_token, aad(userId, "refresh")) : null;
  const expires = new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString();
  await sql`
    insert into public.user_presence_connections
      (user_id, provider, account_name, access_token_enc, access_token_iv, refresh_token_enc, refresh_token_iv, expires_at)
    values (${userId}, 'spotify', ${accountName ?? null}, ${a.ciphertext}, ${a.iv}, ${r?.ciphertext ?? null}, ${r?.iv ?? null}, ${expires})
    on conflict (user_id, provider) do update set
      account_name = coalesce(excluded.account_name, user_presence_connections.account_name),
      access_token_enc = excluded.access_token_enc,
      access_token_iv = excluded.access_token_iv,
      refresh_token_enc = coalesce(excluded.refresh_token_enc, user_presence_connections.refresh_token_enc),
      refresh_token_iv = coalesce(excluded.refresh_token_iv, user_presence_connections.refresh_token_iv),
      expires_at = excluded.expires_at,
      updated_at = now()`;
}

export async function exchangeSpotifyCode(userId: string, code: string, origin?: Request | string) {
  const t = await tokenRequest(
    new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: spotifyRedirectUri(origin) }),
  );
  let name: string | null = null;
  try {
    const me = await fetch("https://api.spotify.com/v1/me", { headers: { Authorization: `Bearer ${t.access_token}` } });
    if (me.ok) name = ((await me.json()) as { display_name?: string }).display_name ?? null;
  } catch {
    /* naam is optioneel */
  }
  await store(userId, t, name);
}

async function accessToken(userId: string, forceRefresh = false): Promise<string | null> {
  const rows = await sql`select * from public.user_presence_connections where user_id = ${userId} and provider = 'spotify'`;
  const row = rows[0] as Record<string, string> | undefined;
  if (!row) return null;
  if (!forceRefresh && new Date(row["expires_at"]!).getTime() > Date.now()) {
    return open(row["access_token_enc"]!, row["access_token_iv"]!, aad(userId, "access"));
  }
  if (!row["refresh_token_enc"]) return null;
  const refresh = await open(row["refresh_token_enc"], row["refresh_token_iv"]!, aad(userId, "refresh"));
  const t = await tokenRequest(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh }));
  await store(userId, t);
  return t.access_token;
}

export type NowPlaying = {
  playing: boolean;
  title?: string;
  artist?: string;
  album?: string;
  image?: string | null;
  url?: string | null;
  progressMs?: number;
  durationMs?: number;
  /** Why nothing is shown (diagnostics only, never tokens). */
  reason?: SpotifyReason;
  /** Server time (ms) at which progressMs was measured. */
  syncedAt?: number;
};

const CACHE_FRESH_MS = 10_000;

/** Cached read: visitors share one Spotify call per ~10 s per member. */
export async function cachedNowPlaying(userId: string): Promise<NowPlaying> {
  const rows = await sql`select *, extract(epoch from sync_timestamp) * 1000 as synced_ms
    from public.user_music_status where user_id = ${userId}`;
  const r = rows[0] as Record<string, unknown> | undefined;
  const syncedMs = r ? Number(r["synced_ms"]) : 0;
  if (r && Date.now() - syncedMs < CACHE_FRESH_MS) {
    if (!r["is_playing"]) return { playing: false };
    return {
      playing: true,
      title: (r["track_name"] as string) ?? undefined,
      artist: (r["artist_name"] as string) ?? undefined,
      image: (r["album_art_url"] as string) ?? null,
      url: (r["external_url"] as string) ?? null,
      progressMs: Number(r["progress_ms"] ?? 0),
      durationMs: Number(r["duration_ms"] ?? 0),
      syncedAt: syncedMs,
    };
  }
  const raw = await nowPlaying(userId);
  // Visitors never see a paused track: only a playing one is cached or returned.
  const live: NowPlaying = raw.playing ? raw : { playing: false, reason: raw.reason };
  const syncedAt = Date.now();
  await sql`insert into public.user_music_status
      (user_id, is_playing, track_name, artist_name, album_art_url, external_url, progress_ms, duration_ms, sync_timestamp, updated_at)
    values (${userId}, ${live.playing}, ${live.title ?? null}, ${live.artist ?? null}, ${live.image ?? null}, ${live.url ?? null},
      ${live.progressMs ?? null}, ${live.durationMs ?? null}, ${new Date(syncedAt).toISOString()}, now())
    on conflict (user_id) do update set is_playing = excluded.is_playing, track_name = excluded.track_name,
      artist_name = excluded.artist_name, album_art_url = excluded.album_art_url, external_url = excluded.external_url,
      progress_ms = excluded.progress_ms, duration_ms = excluded.duration_ms,
      sync_timestamp = excluded.sync_timestamp, updated_at = now()`.catch((e) => console.error("[music-cache]", e));
  const { reason: _r, ...pub } = live;
  return { ...pub, syncedAt };
}

/** Only public track info; never tokens or account details. */
export async function nowPlaying(userId: string): Promise<NowPlaying> {
  let token: string | null;
  try {
    token = await accessToken(userId);
  } catch (e) {
    // A refused refresh (revoked app access, rotated secret) needs a fresh link, not a retry.
    const m = /^spotify_token_(\d+)$/.exec(e instanceof Error ? e.message : "");
    if (m && (m[1] === "400" || m[1] === "401")) return { playing: false, reason: "unauthorized" };
    throw e;
  }
  if (!token) return { playing: false, reason: "not_connected" };
  const call = (t: string) =>
    fetch("https://api.spotify.com/v1/me/player/currently-playing?additional_types=episode", {
      headers: { Authorization: `Bearer ${t}` },
    });
  let res = await call(token);
  if (res.status === 401) {
    const fresh = await accessToken(userId, true).catch(() => null);
    if (!fresh) return { playing: false, reason: "unauthorized" };
    res = await call(fresh);
  }
  const bad = reasonFromStatus(res.status);
  if (bad) {
    if (bad !== "no_content") {
      const body = await res.text().catch(() => "");
      console.error("[Spotify API Error]:", res.status);
    }
    return { playing: false, reason: bad };
  }
  const j = (await res.json()) as {
    is_playing?: boolean;
    progress_ms?: number;
    currently_playing_type?: string;
    item?: {
      name: string;
      artists?: { name: string }[];
      album?: { name: string; images?: { url: string }[] };
      show?: { name: string; images?: { url: string }[] };
      images?: { url: string }[];
      external_urls?: { spotify?: string };
      duration_ms?: number;
    };
  };
  if (!j.item) return { playing: false, reason: j.is_playing ? "unsupported_type" : "not_playing" };
  const ep = j.currently_playing_type === "episode";
  // Paused tracks keep their details (owner dashboard shows them dimmed); public reads only use `playing`.
  return {
    playing: Boolean(j.is_playing),
    reason: j.is_playing ? "playing" : "not_playing",
    title: j.item.name,
    artist: ep ? j.item.show?.name ?? "Podcast" : (j.item.artists ?? []).map((a) => a.name).join(", "),
    album: ep ? j.item.show?.name : j.item.album?.name,
    image: (ep ? j.item.images?.[0]?.url ?? j.item.show?.images?.[0]?.url : j.item.album?.images?.[0]?.url) ?? null,
    url: j.item.external_urls?.spotify ?? null,
    progressMs: j.progress_ms ?? 0,
    durationMs: j.item.duration_ms ?? 0,
  };
}

export async function myConnections(userId: string) {
  const rows = await sql`
    select provider, account_name, show_on_profile, show_on_verified, show_on_alias
      from public.user_presence_connections where user_id = ${userId}`;
  return rows.map((r) => ({
    provider: r["provider"] as string,
    accountName: (r["account_name"] as string | null) ?? null,
    showOnProfile: Boolean(r["show_on_profile"]),
    showOnVerified: r["show_on_verified"] !== false,
    showOnAlias: r["show_on_alias"] !== false,
  }));
}

export async function setShowOnProfile(userId: string, show: boolean) {
  await sql`update public.user_presence_connections set show_on_profile = ${show}, updated_at = now()
    where user_id = ${userId} and provider = 'spotify'`;
}

export async function setSpotifyScope(userId: string, scope: { verified: boolean; alias: boolean }) {
  await sql`update public.user_presence_connections
    set show_on_verified = ${scope.verified}, show_on_alias = ${scope.alias}, updated_at = now()
    where user_id = ${userId} and provider = 'spotify'`;
}

/** Hard unlink: removes every Spotify row (tokens, status, integration) for the user. */
export async function disconnectSpotify(userId: string) {
  await sql`delete from public.user_music_status where user_id = ${userId}`;
  await sql`delete from public.user_presence_connections where user_id = ${userId} and provider = 'spotify'`;
  await sql`delete from public.user_integrations where user_id = ${userId} and provider = 'spotify'`;
}

/** Public lookup: the owner of a handle, only when they opted in and the profile is public. */
export async function publicSpotifyOwner(handle: string): Promise<string | null> {
  const rows = await sql`
    select c.user_id from public.user_presence_connections c
    left join public.profiles p on p.id = c.user_id
    left join public.alias_profiles a on a.user_id = c.user_id
    where c.provider = 'spotify' and c.show_on_profile = true
      and (lower(p.username) = lower(${handle}) or lower(a.handle) = lower(${handle}))
      and coalesce(((case when lower(a.handle) = lower(${handle}) then a.display_prefs else p.display_prefs end) ->> 'publicProfile')::boolean, true)
      and case when lower(a.handle) = lower(${handle}) then c.show_on_alias else c.show_on_verified end
    limit 1`;
  return (rows[0]?.["user_id"] as string | undefined) ?? null;
}
