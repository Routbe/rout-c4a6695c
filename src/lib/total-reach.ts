/**
 * Client-veilige helpers voor het "Totaal bereik"-systeem: types en
 * getalformattering. Geen netwerk- of databasecode.
 */


/** Providers whose public API gives a follower/subscriber count. */
export const AUTO_REACH_PROVIDERS = ["bluesky", "wsocial", "github", "youtube"] as const;
/** Payment addresses have no audience and never count towards reach. */
const NO_REACH = new Set(["lightning", "monero", "ethereum"]);

export const isAutoReachProvider = (provider: string) =>
  (AUTO_REACH_PROVIDERS as readonly string[]).includes(provider);
export const countsTowardsReach = (provider: string) => !NO_REACH.has(provider);

/** Platform-specifieke benaming: YouTube heeft abonnees, de rest volgers. */
export function followerLabel(provider: string, count = 2): string {
  if (provider === "youtube") return count === 1 ? "abonnee" : "abonnees";
  return count === 1 ? "volger" : "volgers";
}

/** One connected Hub integration as shown in the reach modal. */
export type ReachAccount = {
  provider: string;
  handle: string;
  /** Last automatically fetched count (null = never fetched / not available). */
  followerCount: number | null;
  /** User-typed count; wins over the fetched one. */
  manualCount: number | null;
  includeInReach: boolean;
  auto: boolean;
  lastSyncedAt: string | null;
};

export type ReachSettings = {
  showTotalReach: boolean;
  totalReachCount: number;
  lastSyncedAt: string | null;
  accounts: ReachAccount[];
};

/** Count used for one account: manual override first, then the fetched value. */
export const accountReach = (a: Pick<ReachAccount, "manualCount" | "followerCount">) =>
  a.manualCount ?? a.followerCount ?? 0;

/** Sum over included accounts only — never a placeholder. */
export function sumReach(accounts: Pick<ReachAccount, "manualCount" | "followerCount" | "includeInReach">[]): number {
  return accounts.filter((a) => a.includeInReach).reduce((t, a) => t + accountReach(a), 0);
}

/** "12.3K subscribers" / "1,234" → number, or null. */
export function parseCompactCount(text: string): number | null {
  const m = /(\d+(?:[.,]\d+)*)\s*([KMB])?/i.exec(text.replace(/\u00a0/g, " "));
  if (!m) return null;
  const unit = m[2]?.toUpperCase();
  const raw = m[1]!;
  const n = unit ? Number(raw.replace(",", ".")) : Number(raw.replace(/[.,]/g, ""));
  if (!Number.isFinite(n)) return null;
  const mult = unit === "K" ? 1e3 : unit === "M" ? 1e6 : unit === "B" ? 1e9 : 1;
  return Math.round(n * mult);
}

/** 1200 -> "1.2K", 1050000 -> "1.05M", 980 -> "980". */
export function formatReach(count: number | null | undefined): string {
  if (count === null || count === undefined || !Number.isFinite(count) || count <= 0) return "0";
  const n = Math.round(count);
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const value = n / 1000;
    return `${trim(value < 100 ? value.toFixed(1) : value.toFixed(0))}K`;
  }
  const value = n / 1_000_000;
  return `${trim(value < 100 ? value.toFixed(2) : value.toFixed(0))}M`;
}

function trim(value: string): string {
  return value.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

/** "Laatst bijgewerkt: 3 uur geleden" — compacte NL relatieve tijd. */
export function relativeTimeNl(iso: string | null | undefined): string {
  if (!iso) return "nog niet gesynchroniseerd";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "nog niet gesynchroniseerd";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) return "zojuist";
  if (minutes < 60) return `${minutes} min geleden`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} uur geleden`;
  const days = Math.round(hours / 24);
  return `${days} dag${days === 1 ? "" : "en"} geleden`;
}
