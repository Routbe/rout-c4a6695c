import { sql } from "@/lib/neon";
import {
  countsTowardsReach,
  isAutoReachProvider,
  parseCompactCount,
  sumReach,
  type ReachAccount,
  type ReachSettings,
} from "@/lib/total-reach";

/**
 * Total reach, built only from the member's Connections Hub integrations.
 * Open platforms (Bluesky, wsocial.eu, GitHub, YouTube) are fetched from public
 * sources; everything else counts only through a manual number per integration.
 */

type Row = Record<string, unknown>;
const TIMEOUT = 6000;

const iso = (v: unknown) => (!v ? null : v instanceof Date ? v.toISOString() : String(v));
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

async function readAccounts(userId: string): Promise<ReachAccount[]> {
  const rows = (await sql`
    select provider, handle, include_in_reach, follower_count, manual_follower_count, reach_synced_at
      from public.user_integrations where user_id = ${userId} order by created_at`) as Row[];
  return rows
    .filter((r) => countsTowardsReach(String(r["provider"])))
    .map((r) => ({
      provider: String(r["provider"]),
      handle: String(r["handle"]),
      followerCount: num(r["follower_count"]),
      manualCount: num(r["manual_follower_count"]),
      includeInReach: r["include_in_reach"] !== false,
      auto: isAutoReachProvider(String(r["provider"])),
      lastSyncedAt: iso(r["reach_synced_at"]),
    }));
}

export async function recomputeTotalReach(userId: string): Promise<number> {
  const total = sumReach(await readAccounts(userId));
  await sql`update public.profiles set total_reach_count = ${total}, reach_last_synced_at = now() where id = ${userId}`;
  return total;
}

export async function readReachSettings(userId: string): Promise<ReachSettings> {
  const rows = (await sql`
    select coalesce(show_total_reach, false) as show_total_reach, reach_last_synced_at
      from public.profiles where id = ${userId} limit 1`) as Row[];
  const accounts = await readAccounts(userId);
  return {
    showTotalReach: rows[0]?.["show_total_reach"] === true,
    totalReachCount: sumReach(accounts),
    lastSyncedAt: iso(rows[0]?.["reach_last_synced_at"]),
    accounts,
  };
}

export type ReachSettingsInput = {
  showTotalReach?: boolean;
  accounts?: { provider: string; includeInReach?: boolean; manualCount?: number | null }[];
};

export async function saveReachSettings(userId: string, input: ReachSettingsInput): Promise<ReachSettings> {
  if (typeof input.showTotalReach === "boolean") {
    await sql`update public.profiles set show_total_reach = ${input.showTotalReach} where id = ${userId}`;
  }
  for (const a of input.accounts ?? []) {
    if (typeof a.includeInReach === "boolean") {
      await sql`update public.user_integrations set include_in_reach = ${a.includeInReach}
                 where user_id = ${userId} and provider = ${a.provider}`;
    }
    if (a.manualCount !== undefined) {
      const m = a.manualCount === null ? null : Math.max(0, Math.round(a.manualCount));
      await sql`update public.user_integrations set manual_follower_count = ${m}
                 where user_id = ${userId} and provider = ${a.provider}`;
    }
  }
  await recomputeTotalReach(userId);
  return readReachSettings(userId);
}

async function getJson(url: string, headers: Record<string, string> = {}): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(url, { headers: { accept: "application/json", "user-agent": "rout.be", ...headers }, signal: AbortSignal.timeout(TIMEOUT) });
    return r.ok ? ((await r.json()) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Public follower/subscriber count for an open platform, or null. */
export async function fetchFollowerCount(provider: string, handle: string): Promise<number | null> {
  switch (provider) {
    case "bluesky":
    case "wsocial": {
      const j = await getJson(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`);
      return typeof j?.["followersCount"] === "number" ? (j["followersCount"] as number) : null;
    }
    case "github": {
      const t = process.env["GITHUB_PUBLIC_TOKEN"];
      const j = await getJson(`https://api.github.com/users/${encodeURIComponent(handle)}`, t ? { authorization: `Bearer ${t}` } : {});
      return typeof j?.["followers"] === "number" ? (j["followers"] as number) : null;
    }
    case "youtube": {
      try {
        const path = handle.startsWith("UC") ? `channel/${handle}` : handle;
        const r = await fetch(`https://www.youtube.com/${path}`, { headers: { "accept-language": "en" }, signal: AbortSignal.timeout(TIMEOUT) });
        if (!r.ok) return null;
        const html = await r.text();
        const text =
          html.match(/"subscriberCountText":\{"accessibility":\{"accessibilityData":\{"label":"([^"]+)"/)?.[1] ??
          html.match(/"subscriberCountText":\{"simpleText":"([^"]+)"/)?.[1] ??
          html.match(/"content":"([\d.,]+[KMB]?) subscribers"/)?.[1];
        return text ? parseCompactCount(text) : null;
      } catch {
        return null;
      }
    }
    default:
      return null;
  }
}

/** Refreshes every included open-platform account, then recomputes the total. */
export async function syncFollowersForProfile(userId: string): Promise<ReachSettings> {
  for (const a of await readAccounts(userId)) {
    if (!a.auto || !a.includeInReach) continue;
    const count = await fetchFollowerCount(a.provider, a.handle);
    if (count !== null) {
      await sql`update public.user_integrations set follower_count = ${count}, reach_synced_at = now()
                 where user_id = ${userId} and provider = ${a.provider}`;
    }
  }
  await recomputeTotalReach(userId);
  return readReachSettings(userId);
}

/** Background cron: refreshes profiles that show reach, oldest first. */
export async function syncFollowersBatch(limit = 50) {
  const rows = (await sql`
    select id from public.profiles
     where coalesce(show_total_reach, false) = true
       and (reach_last_synced_at is null or reach_last_synced_at < now() - interval '12 hours')
     order by reach_last_synced_at asc nulls first
     limit ${limit}`) as Row[];
  let synced = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await syncFollowersForProfile(String(row["id"]));
      synced += 1;
    } catch {
      failed += 1;
    }
  }
  return { profiles: rows.length, synced, failed };
}
