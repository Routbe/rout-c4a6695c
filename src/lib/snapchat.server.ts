/**
 * Snapchat via Snap Kit (server-only): Login Kit for the Snap identity and
 * Bitmoji Kit for the avatar. No Snap Map / location — Snap offers none.
 *
 * Flow: /api/snapchat/start → Snap consent → /api/public/snapchat/callback.
 * Env: SNAPCHAT_CLIENT_ID, SNAPCHAT_CLIENT_SECRET.
 * The redirect URI is always the one registered in Snap Kit (SITE_ORIGIN), never the
 * request/preview host: Snap rejects any URI that is not an exact match.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { sql } from "@/lib/neon";
import { SITE_ORIGIN } from "@/lib/site";

const SCOPES = [
  "https://auth.snapchat.com/oauth2/api/user.display_name",
  "https://auth.snapchat.com/oauth2/api/user.bitmoji.avatar",
  "https://auth.snapchat.com/oauth2/api/user.external_id",
].join(" ");
const STATE_TTL_MS = 10 * 60 * 1000;
const BITMOJI_HOST = /^https:\/\/(sdk|images)\.bitmoji\.com\//i;

export function snapchatConfigured(): boolean {
  return Boolean(process.env["SNAPCHAT_CLIENT_ID"] && process.env["SNAPCHAT_CLIENT_SECRET"]);
}

export const SNAPCHAT_REDIRECT_URI = `${SITE_ORIGIN}/api/public/snapchat/callback`;

/** Fixed, registered callback. The argument is ignored on purpose (kept for call-site compatibility). */
export function snapchatRedirectUri(_origin?: Request | string): string {
  return SNAPCHAT_REDIRECT_URI;
}

function snapSecret(): string {
  const k = process.env["SNAPCHAT_CLIENT_SECRET"];
  if (!k) throw new Error("not_configured: Snapchat");
  return k;
}
const mac = (p: string) => createHmac("sha256", snapSecret()).update(p).digest("hex").slice(0, 32);

export function signSnapState(userId: string, now = Date.now()): string {
  const p = `snap.${userId}.${now}`;
  return `${p}.${mac(p)}`;
}

export function verifySnapState(state: string, now = Date.now()): string | null {
  if (!process.env["SNAPCHAT_CLIENT_SECRET"]) return null;
  const parts = state.split(".");
  if (parts.length !== 4 || parts[0] !== "snap") return null;
  const [, userId, ts, sig] = parts as [string, string, string, string];
  const issued = Number(ts);
  if (!Number.isFinite(issued) || now - issued > STATE_TTL_MS || issued > now + 60_000) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(mac(`snap.${userId}.${ts}`));
  return a.length === b.length && timingSafeEqual(a, b) ? userId : null;
}

export function snapchatAuthorizeUrl(userId: string, origin?: Request | string): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: process.env["SNAPCHAT_CLIENT_ID"]!,
    redirect_uri: snapchatRedirectUri(origin),
    scope: SCOPES,
    state: signSnapState(userId),
  });
  const url = `https://accounts.snapchat.com/accounts/oauth2/auth?${p}`;
  // Non-sensitive diagnostics: the state (signed user id) is never logged.
  console.info("[snapchat] authorize", { redirect_uri: SNAPCHAT_REDIRECT_URI, scope: SCOPES, client_id_set: true });
  return url;
}

export function isBitmojiUrl(url: string): boolean {
  return BITMOJI_HOST.test(url) && url.length <= 600;
}

/** Exchanges the code, reads the Snap identity + Bitmoji once; the token is not kept. */
export async function exchangeSnapCode(userId: string, code: string, origin?: Request | string) {
  const basic = btoa(`${process.env["SNAPCHAT_CLIENT_ID"]}:${process.env["SNAPCHAT_CLIENT_SECRET"]}`);
  const res = await fetch("https://accounts.snapchat.com/accounts/oauth2/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: snapchatRedirectUri(origin) }),
  });
  if (!res.ok) throw new Error(`snap_token_${res.status}`);
  const { access_token } = (await res.json()) as { access_token: string };
  const q = encodeURIComponent("{me{externalId displayName bitmoji{avatar}}}");
  const me = await fetch(`https://kit.snapchat.com/v1/me?query=${q}`, { headers: { Authorization: `Bearer ${access_token}` } });
  if (!me.ok) throw new Error(`snap_me_${me.status}`);
  const body = (await me.json()) as { data?: { me?: { externalId?: string; displayName?: string; bitmoji?: { avatar?: string } } } };
  const m = body.data?.me;
  if (!m?.externalId) throw new Error("snap_no_id");
  const avatar = m.bitmoji?.avatar && isBitmojiUrl(m.bitmoji.avatar) ? m.bitmoji.avatar : null;
  const taken = await sql`select user_id from public.user_snapchat where external_id = ${m.externalId} and user_id <> ${userId}`;
  if (taken.length) throw new Error("snap_in_use");
  await sql`
    insert into public.user_snapchat (user_id, external_id, display_name, bitmoji_url)
    values (${userId}, ${m.externalId}, ${m.displayName ?? null}, ${avatar})
    on conflict (user_id) do update set external_id = excluded.external_id,
      display_name = excluded.display_name, bitmoji_url = coalesce(excluded.bitmoji_url, user_snapchat.bitmoji_url),
      updated_at = now()`;
}

export type SnapRow = {
  displayName: string | null;
  bitmojiUrl: string | null;
  moodEmoji: string | null;
  moodText: string | null;
  showCard: boolean;
  showMood: boolean;
};

const toRow = (r: Record<string, unknown>): SnapRow => ({
  displayName: (r["display_name"] as string) ?? null,
  bitmojiUrl: (r["bitmoji_url"] as string) ?? null,
  moodEmoji: (r["mood_emoji"] as string) ?? null,
  moodText: (r["mood_text"] as string) ?? null,
  showCard: r["show_card"] === true,
  showMood: r["show_mood"] === true,
});

export async function mySnapchat(userId: string): Promise<SnapRow | null> {
  const rows = await sql`select * from public.user_snapchat where user_id = ${userId}`;
  return rows[0] ? toRow(rows[0] as Record<string, unknown>) : null;
}

export async function updateSnapchat(userId: string, p: Partial<Pick<SnapRow, "moodEmoji" | "moodText" | "showCard" | "showMood">>) {
  await sql`update public.user_snapchat set
    mood_emoji = case when ${p.moodEmoji !== undefined} then ${p.moodEmoji ?? null} else mood_emoji end,
    mood_text  = case when ${p.moodText !== undefined} then ${p.moodText ?? null} else mood_text end,
    show_card  = coalesce(${p.showCard ?? null}::boolean, show_card),
    show_mood  = coalesce(${p.showMood ?? null}::boolean, show_mood),
    updated_at = now()
    where user_id = ${userId}`;
}

/** Sets the Bitmoji as profile photo directly (no upload). */
export async function useBitmojiAsAvatar(userId: string): Promise<boolean> {
  const rows = await sql`select bitmoji_url from public.user_snapchat where user_id = ${userId}`;
  const url = rows[0]?.["bitmoji_url"] as string | undefined;
  if (!url || !isBitmojiUrl(url)) return false;
  await sql`update public.profiles set avatar_url = ${url}, updated_at = now() where id = ${userId}`;
  return true;
}

export async function disconnectSnapchat(userId: string) {
  await sql`delete from public.user_snapchat where user_id = ${userId}`;
}

/** Public: only opted-in parts, only for public profiles. */
export async function publicSnapchat(handle: string) {
  const rows = await sql`
    select s.* from public.user_snapchat s
    join public.profiles p on p.id = s.user_id
    where lower(p.username) = lower(${handle})
      and coalesce((p.display_prefs ->> 'publicProfile')::boolean, true)
      and (s.show_card or s.show_mood)
    limit 1`;
  if (!rows[0]) return null;
  const r = toRow(rows[0] as Record<string, unknown>);
  return {
    card: r.showCard ? { displayName: r.displayName, bitmojiUrl: r.bitmojiUrl } : null,
    mood: r.showMood && (r.moodText || r.moodEmoji) ? { emoji: r.moodEmoji, text: r.moodText, bitmojiUrl: r.bitmojiUrl } : null,
  };
}
