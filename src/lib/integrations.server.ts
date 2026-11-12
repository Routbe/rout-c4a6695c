import { isLiveActive } from "./live-presence-rules";
/**
 * Connections Hub storage + public live-status fetchers. Server-only.
 * `verified` is derived here from real sign-in identities or a server-side bio-check — never from input.
 */
import { sql } from "@/lib/neon";
import { integrationById } from "./integrations-catalog";
import { normalizeIntegrationValue, visibleForMode, type Audience } from "./integrations-rules";

type Row = Record<string, unknown>;

export type IntegrationStatus = {
  title?: string;
  /** ISO time of the last public activity (live-status window). */
  lastActiveAt?: string;
  subtitle?: string;
  url?: string;
  image?: string | null;
  /** Chess cards: Blitz/Rapid ratings, live status (Lichess) and challenge link. */
  /** Public bio (open-web profiles). */
  bio?: string;
  /** Small counters, e.g. repos / followers. */
  stats?: { label: string; value: number }[];
  /** Latest YouTube uploads (keyless RSS feed). */
  videos?: { title: string; url: string; date: string | null; thumb: string }[];
  /** Latest feed entries (RSS / blog). */
  posts?: { title: string; url: string; date: string | null }[];
  /** Duolingo card: streak, active language, total XP. */
  duolingo?: { streak: number | null; languageName: string | null; totalXp: number | null };
  chess?: { blitz?: number | null; rapid?: number | null; online?: boolean | null; challengeUrl?: string; username?: string };
};

export type MyIntegration = {
  provider: string;
  handle: string;
  audience: Audience;
  visible: boolean;
  verified: boolean;
  verifiedAt: string | null;
  verificationMethod: "oauth" | "bio_scrape" | null;
  showOnVerified: boolean;
  showOnAlias: boolean;
};

export type PublicIntegration = MyIntegration & { status: IntegrationStatus | null };

const STATUS_TTL_MS = 10 * 60 * 1000;
/** Chess cards show live status, so they refresh more often. */
const CHESS_TTL_MS = 2 * 60 * 1000;
const FETCH_TIMEOUT_MS = 6000;

function toMine(r: Row): MyIntegration {
  return {
    provider: String(r["provider"]),
    handle: String(r["handle"]),
    audience: (r["audience"] as Audience) ?? "both",
    visible: r["visible"] !== false,
    verified: r["verified"] === true,
    verifiedAt: r["verified_at"] ? new Date(String(r["verified_at"])).toISOString() : null,
    verificationMethod: r["verified"] !== true ? null : r["verified_via"] === "bio" ? "bio_scrape" : "oauth",
    showOnVerified: r["show_on_verified"] !== false,
    showOnAlias: r["show_on_alias"] !== false,
  };
}

/** Handles proven by sign-in, keyed by catalogue provider id. */
export async function ssoHandles(userId: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    const { listIdentities } = await import("./identities.server");
    const ids = await listIdentities(userId);
    for (const id of ids) {
      const p = id.provider.toLowerCase();
      if (p === "github" && !out["github"]) {
        const login = await githubLoginById(id.providerAccountId);
        if (login) out["github"] = login;
      } else if (p === "gitlab" && !out["gitlab"]) {
        const login = await gitlabLoginById(id.providerAccountId);
        if (login) out["gitlab"] = login;
      } else if (p === "bluesky" && !out["bluesky"]) {
        const h = id.displayName && id.displayName.includes(".") ? id.displayName : await atHandleForDid(id.providerAccountId);
        if (h) out[h.endsWith(".wsocial.eu") ? "wsocial" : "bluesky"] = h.toLowerCase();
      } else if (p === "mastodon" && !out["mastodon"] && id.displayName?.includes("@")) {
        out["mastodon"] = id.displayName.toLowerCase();
      }
    }
  } catch (e) {
    console.warn("[integrations] sso lookup failed", e instanceof Error ? e.message : e);
  }
  return out;
}

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "rout.be", ...headers }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function githubLoginById(id: string): Promise<string | null> {
  if (!/^\d+$/.test(id)) return null;
  const j = (await getJson(`https://api.github.com/user/${id}`, githubAuth())) as { login?: string } | null;
  return j?.login ?? null;
}

async function gitlabLoginById(id: string): Promise<string | null> {
  if (!/^\d+$/.test(id)) return null;
  const j = (await getJson(`https://gitlab.com/api/v4/users/${id}`)) as { username?: string } | null;
  return j?.username ?? null;
}

async function atHandleForDid(did: string): Promise<string | null> {
  if (!/^did:[a-z]+:[A-Za-z0-9._:%-]+$/.test(did)) return null;
  const j = (await getJson(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`)) as { handle?: string } | null;
  return j?.handle ?? null;
}

function githubAuth(): Record<string, string> {
  const t = process.env["GITHUB_TOKEN"] || process.env["GITHUB_PUBLIC_TOKEN"];
  return t ? { authorization: `Bearer ${t}` } : {};
}

function ago(iso: string | undefined): string {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 60) return `${mins} min geleden`;
  const h = Math.round(mins / 60);
  if (h < 24) return h === 1 ? "1 uur geleden" : `${h} uur geleden`;
  const d = Math.round(h / 24);
  return d === 1 ? "gisteren" : `${d} dagen geleden`;
}

function isToday(iso: string | undefined): boolean {
  return !!iso && Date.now() - Date.parse(iso) < 24 * 3600 * 1000;
}

/** Fetches the live status for one connection from public sources. */
export async function fetchStatus(provider: string, handle: string): Promise<IntegrationStatus | null> {
  switch (provider) {
    case "github": {
      const ev = (await getJson(`https://api.github.com/users/${encodeURIComponent(handle)}/events/public?per_page=10`, githubAuth())) as
        | { type: string; created_at: string; repo?: { name: string }; payload?: { commits?: { message: string }[] } }[]
        | null;
      const push = ev?.find((e) => e.type === "PushEvent");
      const last = ev?.[0];
      const prof = (await getJson(`https://api.github.com/users/${encodeURIComponent(handle)}`, githubAuth())) as
        | { public_repos?: number; followers?: number; bio?: string | null; avatar_url?: string }
        | null;
      return {
        bio: prof?.bio ?? undefined,
        stats: prof ? [{ label: "repo's", value: prof.public_repos ?? 0 }, { label: "volgers", value: prof.followers ?? 0 }] : undefined,
        title: isToday(last?.created_at) ? "Actief vandaag" : last ? `Laatst actief ${ago(last.created_at)}` : "Geen recente activiteit",
        subtitle: push ? `${push.repo?.name ?? ""} · ${(push.payload?.commits?.at(-1)?.message ?? "").split("\n")[0]}`.slice(0, 120) : undefined,
        url: `https://github.com/${handle}`,
        image: `https://avatars.githubusercontent.com/${handle}`,
        lastActiveAt: last?.created_at,
      };
    }
    case "gitlab": {
      const users = (await getJson(`https://gitlab.com/api/v4/users?username=${encodeURIComponent(handle)}`)) as { id: number; avatar_url?: string }[] | null;
      const u = users?.[0];
      if (!u) return null;
      const ev = (await getJson(`https://gitlab.com/api/v4/users/${u.id}/events?per_page=5`)) as
        | { created_at: string; action_name: string; push_data?: { commit_title?: string } }[]
        | null;
      const last = ev?.[0];
      return {
        title: isToday(last?.created_at) ? "Actief vandaag" : last ? `Laatst actief ${ago(last.created_at)}` : "Geen recente activiteit",
        subtitle: last?.push_data?.commit_title?.slice(0, 120),
        url: `https://gitlab.com/${handle}`,
        image: u.avatar_url ?? null,
        lastActiveAt: last?.created_at,
      };
    }
    case "wakatime": {
      const j = (await getJson(`https://wakatime.com/api/v1/users/${encodeURIComponent(handle)}/stats/last_7_days`)) as
        | { data?: { languages?: { name: string; total_seconds: number }[]; human_readable_daily_average?: string } }
        | null;
      const lang = j?.data?.languages?.[0];
      if (!j?.data) return null;
      return {
        // A 7-day summary, never presented as "coding right now".
        title: lang ? `Codeert vooral in ${lang.name} (7 dagen)` : "Codeerstatistiek (7 dagen)",
        subtitle: j.data.human_readable_daily_average ? `${j.data.human_readable_daily_average} per dag` : undefined,
        url: `https://wakatime.com/@${handle}`,
      };
    }
    case "bluesky":
    case "wsocial": {
      const j = (await getJson(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`)) as
        | { displayName?: string; followersCount?: number; avatar?: string; description?: string }
        | null;
      if (!j) return null;
      const feed = (await getJson(`https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&limit=1&filter=posts_no_replies`)) as
        | { feed?: { post?: { indexedAt?: string; record?: { createdAt?: string } } }[] }
        | null;
      const lastPost = feed?.feed?.[0]?.post;
      return {
        lastActiveAt: lastPost?.record?.createdAt ?? lastPost?.indexedAt,
        bio: j.description?.slice(0, 300),
        title: j.displayName || `@${handle}`,
        subtitle: typeof j.followersCount === "number" ? `${j.followersCount.toLocaleString("nl-BE")} volgers` : undefined,
        url: provider === "wsocial" ? `https://wsocial.eu/profile/${handle}` : `https://bsky.app/profile/${handle}`,
        image: j.avatar ?? null,
      };
    }
    case "mastodon": {
      const acct = await mastodonAccount(handle);
      if (!acct) return null;
      const domain = handle.split("@")[1]!;
      // last_status_at is only a date; the newest own post gives the real moment.
      const latest = acct.id
        ? ((await getJson(`https://${domain}/api/v1/accounts/${encodeURIComponent(acct.id)}/statuses?limit=1&exclude_replies=true&exclude_reblogs=true`)) as { created_at?: string }[] | null)
        : null;
      return {
        lastActiveAt: latest?.[0]?.created_at ?? undefined,
        title: acct.display_name || `@${handle}`,
        subtitle: `@${handle.split("@")[0]} · ${domain}`,
        bio: stripHtml(acct.note ?? "").slice(0, 300),
        stats: typeof acct.followers_count === "number" ? [{ label: "volgers", value: acct.followers_count }] : undefined,
        url: acct.url && /^https:\/\//.test(acct.url) ? acct.url : `https://${domain}/@${handle.split("@")[0]}`,
        image: acct.avatar_static ?? acct.avatar ?? null,
      };
    }
    case "rss": {
      const { parseFeed, isPublicHost } = await import("./open-web-rules");
      let host = "";
      try {
        host = new URL(handle).hostname;
      } catch {
        return null;
      }
      if (!isPublicHost(host)) return null;
      try {
        // DNS-niveau SSRF-guard: een publiek uitziende naam mag niet naar een
        // intern/metadata-adres resolven (security/ssrf-guard.server.ts).
        const { validateOutboundUrl } = await import("./security/ssrf-guard.server");
        await validateOutboundUrl(handle);
        const res = await fetch(handle, { redirect: "manual", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { "user-agent": "rout.be feed reader", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" } });
        if (!res.ok) return null;
        const xml = (await res.text()).slice(0, 500_000);
        const feed = parseFeed(xml, 3);
        if (!feed.items.length) return null;
        return { title: feed.title ?? host, subtitle: host, url: `https://${host}`, posts: feed.items };
      } catch {
        return null;
      }
    }
    case "youtube": {
      let channelId = handle.startsWith("UC") ? handle : null;
      if (!channelId) {
        try {
          const page = await fetch(`https://www.youtube.com/${handle}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { "accept-language": "en" } });
          const html = page.ok ? await page.text() : "";
          channelId = html.match(/"channelId":"(UC[A-Za-z0-9_-]{22})"/)?.[1] ?? null;
        } catch {
          channelId = null;
        }
      }
      if (!channelId) return null;
      try {
        const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (!res.ok) return null;
        const xml = await res.text();
        const entries = xml.split("<entry>").slice(1, 4);
        const videos = entries
          .map((entry) => {
            const vid = entry.match(/<yt:videoId>([A-Za-z0-9_-]{6,20})<\/yt:videoId>/)?.[1];
            const title = entry.match(/<title>([^<]*)<\/title>/)?.[1];
            const published = entry.match(/<published>([^<]+)<\/published>/)?.[1];
            if (!vid || !title) return null;
            return { title: decodeXml(title).slice(0, 160), url: `https://www.youtube.com/watch?v=${vid}`, date: published ?? null, thumb: `https://i.ytimg.com/vi/${vid}/mqdefault.jpg` };
          })
          .filter((v): v is NonNullable<typeof v> => v !== null);
        const channel = xml.match(/<title>([^<]*)<\/title>/)?.[1];
        const first = videos[0];
        return {
          title: channel ? decodeXml(channel) : "YouTube-kanaal",
          subtitle: first?.date ? `Nieuwste video · ${ago(first.date)}` : undefined,
          url: `https://www.youtube.com/channel/${channelId}`,
          image: first?.thumb ?? null,
          videos,
        };
      } catch {
        return null;
      }
    }
    case "duolingo": {
      const { fetchDuolingo } = await import("./duolingo.server");
      const d = await fetchDuolingo(handle);
      if (!d) return null;
      return {
        title: d.username,
        url: `https://www.duolingo.com/profile/${encodeURIComponent(d.username)}`,
        image: null,
        duolingo: { streak: d.streak, languageName: d.languageName, totalXp: d.totalXp },
      };
    }
    case "lichess": {
      const j = (await getJson(`https://lichess.org/api/user/${encodeURIComponent(handle)}`, { accept: "application/json" })) as
        | { username?: string; title?: string; online?: boolean; disabled?: boolean; perfs?: Record<string, { rating?: number }> }
        | null;
      if (!j?.username || j.disabled) return null;
      return {
        title: `${j.title ? `${j.title} ` : ""}${j.username}`,
        subtitle: chessLine(j.perfs?.blitz?.rating, j.perfs?.rapid?.rating),
        url: `https://lichess.org/@/${j.username}`,
        image: null,
        chess: {
          username: j.username,
          blitz: j.perfs?.blitz?.rating ?? null,
          rapid: j.perfs?.rapid?.rating ?? null,
          online: Boolean(j.online),
          challengeUrl: `https://lichess.org/?user=${encodeURIComponent(j.username)}#friend`,
        },
      };
    }
    case "chesscom": {
      const id = handle.toLowerCase();
      const [p, s] = (await Promise.all([
        getJson(`https://api.chess.com/pub/player/${encodeURIComponent(id)}`),
        getJson(`https://api.chess.com/pub/player/${encodeURIComponent(id)}/stats`),
      ])) as [
        { username?: string; title?: string; avatar?: string; url?: string } | null,
        { chess_blitz?: { last?: { rating?: number } }; chess_rapid?: { last?: { rating?: number } } } | null,
      ];
      if (!p?.username) return null;
      const blitz = s?.chess_blitz?.last?.rating ?? null;
      const rapid = s?.chess_rapid?.last?.rating ?? null;
      return {
        title: `${p.title ? `${p.title} ` : ""}${p.username}`,
        subtitle: chessLine(blitz, rapid),
        url: p.url ?? `https://www.chess.com/member/${id}`,
        image: p.avatar ?? null,
        chess: {
          username: p.username,
          blitz,
          rapid,
          online: null,
          challengeUrl: `https://www.chess.com/play/online/new?opponent=${encodeURIComponent(id)}`,
        },
      };
    }
    default:
      return null;
  }
}

type MastodonAccount = { id?: string; display_name?: string; note?: string; url?: string; avatar?: string; avatar_static?: string; followers_count?: number; last_status_at?: string | null };

async function mastodonAccount(handle: string): Promise<MastodonAccount | null> {
  const { isPublicHost } = await import("./open-web-rules");
  const [user, domain] = handle.split("@");
  if (!user || !domain || !isPublicHost(domain)) return null;
  return (await getJson(`https://${domain}/api/v1/accounts/lookup?acct=${encodeURIComponent(user)}`)) as MastodonAccount | null;
}

function stripHtml(s: string): string {
  return decodeXml(s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*<p>/gi, "\n").replace(/<[^>]*>/g, "")).trim();
}

/** Live public bio for the bio-check; null when the profile cannot be read. */
export async function fetchBio(provider: string, handle: string): Promise<string | null> {
  switch (provider) {
    case "bluesky":
    case "wsocial": {
      const j = (await getJson(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`)) as { description?: string } | null;
      return j ? j.description ?? "" : null;
    }
    case "mastodon": {
      const a = await mastodonAccount(handle);
      return a ? a.note ?? "" : null;
    }
    case "github": {
      const j = (await getJson(`https://api.github.com/users/${encodeURIComponent(handle)}`, githubAuth())) as { bio?: string | null } | null;
      return j ? j.bio ?? "" : null;
    }
    case "chesscom": {
      // Geen publieke bio-API: lees de openbare profielpagina.
      try {
        const res = await fetch(`https://www.chess.com/member/${encodeURIComponent(handle)}`, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            Accept: "text/html",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        return (await res.text()).slice(0, 1_500_000);
      } catch {
        return null;
      }
    }
    default:
      return null;
  }
}

/** Starts a bio-check: stores a fresh short code for this connection. */
export async function startBioVerify(userId: string, provider: string): Promise<string> {
  const { isBioVerifiable } = await import("./open-web-rules");
  if (!isBioVerifiable(provider)) throw new Error("unsupported_provider");
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const code = `rout-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}`;
  const rows = (await sql`update public.user_integrations set verify_code = ${code}, verify_code_at = now(), updated_at = now()
     where user_id = ${userId} and provider = ${provider} returning provider`) as Row[];
  if (!rows.length) throw new Error("not_connected");
  return code;
}

/**
 * Reads the live bio; marks the connection verified when it contains the
 * member's own link `rout.be/<username>` (strict word-boundary match) or the
 * still-valid temporary code.
 */
export async function checkBioVerify(userId: string, provider: string): Promise<"verified" | "not_found" | "expired" | "unreachable"> {
  const { bioContainsCode, bioContainsRoutLink, isBioVerifiable, VERIFY_CODE_TTL_MS } = await import("./open-web-rules");
  if (!isBioVerifiable(provider)) return "unreachable";
  const rows = (await sql`select i.handle, i.verify_code, i.verify_code_at, p.username
      from public.user_integrations i left join public.profiles p on p.id = i.user_id
     where i.user_id = ${userId} and i.provider = ${provider}`) as Row[];
  const r = rows[0];
  if (!r) return "expired";
  const code = r["verify_code"] ? String(r["verify_code"]) : "";
  const at = r["verify_code_at"] ? Date.parse(String(r["verify_code_at"])) : 0;
  const codeValid = Boolean(code) && Date.now() - at <= VERIFY_CODE_TTL_MS;
  const username = r["username"] ? String(r["username"]) : "";
  const bio = await fetchBio(provider, String(r["handle"]));
  if (bio === null) return "unreachable";
  const ok = bioContainsRoutLink(bio, username) || (codeValid && bioContainsCode(bio, code));
  if (!ok) return "not_found";
  await sql`update public.user_integrations set verified = true, verified_via = 'bio', verified_at = now(),
       verify_code = null, verify_code_at = null, updated_at = now()
     where user_id = ${userId} and provider = ${provider}`;
  return "verified";
}

function chessLine(blitz?: number | null, rapid?: number | null): string | undefined {
  const parts = [blitz ? `Blitz ${blitz}` : "", rapid ? `Rapid ${rapid}` : ""].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}

function decodeXml(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

export async function listMine(userId: string): Promise<MyIntegration[]> {
  const rows = (await sql`
    select provider, handle, audience, visible, verified, verified_via, verified_at, show_on_verified, show_on_alias from public.user_integrations
     where user_id = ${userId} order by created_at`) as Row[];
  return rows.map(toMine);
}

export async function saveMine(
  userId: string,
  input: { provider: string; handle?: string; audience: Audience; visible: boolean; useSso?: boolean; showOnVerified?: boolean; showOnAlias?: boolean },
): Promise<MyIntegration> {
  const item = integrationById(input.provider);
  if (!item || item.mode === "soon" || item.mode === "oauth") throw new Error("unsupported_provider");
  {
    const { readSwitches } = await import("./integration-switches.server");
    const { mayLink } = await import("./integration-switches");
    if (!mayLink(await readSwitches(), input.provider)) throw new Error("integration_disabled");
  }
  const sso = item.sso || input.provider === "wsocial" ? await ssoHandles(userId) : {};
  const ssoHandle = sso[input.provider];
  const handle = input.useSso && ssoHandle ? ssoHandle : normalizeIntegrationValue(input.provider, input.handle ?? "");
  if (!handle) throw new Error("invalid_value");
  const verified = Boolean(ssoHandle && ssoHandle.toLowerCase() === handle.toLowerCase());
  const rows = (await sql`
    insert into public.user_integrations (user_id, provider, handle, audience, visible, verified, verified_via, status_json, status_at, show_on_verified, show_on_alias)
    values (${userId}, ${input.provider}, ${handle}, ${input.audience}, ${input.visible}, ${verified}, ${verified ? "sso" : null}, null, null,
            ${input.showOnVerified ?? true}, ${input.showOnAlias ?? true})
    on conflict (user_id, provider) do update set
      handle = excluded.handle, audience = excluded.audience, visible = excluded.visible,
      show_on_verified = coalesce(${input.showOnVerified ?? null}::boolean, public.user_integrations.show_on_verified),
      show_on_alias = coalesce(${input.showOnAlias ?? null}::boolean, public.user_integrations.show_on_alias),
      verified = case when excluded.verified then true
        when public.user_integrations.handle = excluded.handle and public.user_integrations.verified_via = 'bio' then public.user_integrations.verified
        else false end,
      verified_via = case when excluded.verified then 'sso'
        when public.user_integrations.handle = excluded.handle and public.user_integrations.verified_via = 'bio' then 'bio'
        else null end,
      verified_at = case when excluded.verified then coalesce(public.user_integrations.verified_at, now())
        when public.user_integrations.handle = excluded.handle and public.user_integrations.verified_via = 'bio' then public.user_integrations.verified_at
        else null end,
      verify_code = case when public.user_integrations.handle = excluded.handle then public.user_integrations.verify_code end,
      status_json = case when public.user_integrations.handle = excluded.handle then public.user_integrations.status_json end,
      status_at = case when public.user_integrations.handle = excluded.handle then public.user_integrations.status_at end,
      updated_at = now()
    returning provider, handle, audience, visible, verified, verified_via, verified_at, show_on_verified, show_on_alias`) as Row[];
  return toMine(rows[0]!);
}

export async function removeMine(userId: string, provider: string): Promise<void> {
  await sql`delete from public.user_integrations where user_id = ${userId} and provider = ${provider}`;
}

/** Public cards for a handle; respects publicProfile and the Pro/Social face. */
export async function publicIntegrations(handle: string, mode: "pro" | "social" | null): Promise<PublicIntegration[]> {
  const rows = (await sql`
    select i.user_id, i.provider, i.handle, i.audience, i.visible, i.verified, i.status_json, i.status_at
      from public.user_integrations i
      left join public.profiles p on p.id = i.user_id
      left join public.alias_profiles a on a.user_id = i.user_id
     where i.visible = true
       and (lower(p.username) = lower(${handle}) or lower(a.handle) = lower(${handle}))
       and coalesce((coalesce(a.display_prefs, p.display_prefs) ->> 'publicProfile')::boolean, true)
       and case when lower(a.handle) = lower(${handle}) then i.show_on_alias else i.show_on_verified end
     order by i.created_at
     limit 40`) as Row[];
  const { readSwitches } = await import("./integration-switches.server");
  const { isShownPublicly, mayFetchLive } = await import("./integration-switches");
  const switches = await readSwitches();
  const shown = visibleForMode(rows.map((r) => ({ ...toMine(r), row: r })), mode).filter((m) =>
    isShownPublicly(switches, m.provider),
  );
  const all = await Promise.all(
    shown.map(async ({ row, ...m }) => {
      // A rel=me integration must never regain a stale badge through the hub.
      if (m.provider === "mastodon" && m.handle.startsWith("https://")) {
        const { readFediverseProfile } = await import("./fediverse-profile.server");
        const identity = await readFediverseProfile(String(row["user_id"])).catch(() => null);
        m.verified = identity?.verified === true;
      }
      const cached = (row["status_json"] as IntegrationStatus | null) ?? null;
      const at = row["status_at"] ? Date.parse(String(row["status_at"])) : 0;
      const item = integrationById(m.provider);
      const ttl = m.provider === "lichess" || m.provider === "chesscom" ? CHESS_TTL_MS : STATUS_TTL_MS;
      if (item?.mode === "handle" && mayFetchLive(switches, m.provider) && Date.now() - at > ttl) {
        const refresh = refreshStatus(String(row["user_id"]), m.provider, m.handle, row["status_at"]);
        // Stale-while-revalidate: serve the cache now, refresh for the next visitor.
        if (cached) {
          void refresh.catch(() => undefined);
          return { ...m, status: cached };
        }
        return { ...m, status: await refresh.catch(() => null) };
      }
      return { ...m, status: cached };
    }),
  );
  // Live-status components only show while (recently) in use.
  return all.filter((m) => isLiveActive(m.provider, m.status?.lastActiveAt ?? null));
}

/**
 * Claims the stale row (compare-and-set on status_at) so concurrent visitors
 * trigger one upstream fetch, then stores the fresh status. Returns null when
 * another request already claimed it or the fetch failed.
 */
async function refreshStatus(userId: string, provider: string, handle: string, seenAt: unknown): Promise<IntegrationStatus | null> {
  const prev = seenAt ? String(seenAt) : null;
  const claimed = (await sql`update public.user_integrations set status_at = now()
     where user_id = ${userId} and provider = ${provider}
       and status_at is not distinct from ${prev}::timestamptz
     returning provider`) as Row[];
  if (!claimed.length) return null;
  const fresh = await fetchStatus(provider, handle);
  if (fresh) {
    await sql`update public.user_integrations set status_json = ${JSON.stringify(fresh)}::jsonb, status_at = now()
       where user_id = ${userId} and provider = ${provider}`;
  }
  return fresh;
}
