import { notifyError } from "@/lib/notify";
import { describeAdminError } from "@/lib/admin-errors";

/** Consistent, actionable failure toast for every admin action. */
export function adminToastError(error: unknown, fallback: string) {
  const info = describeAdminError(error, fallback);
  // De-duplicated: repeated background failures must not stack toasts.
  notifyError(info.title, { description: info.description, key: `admin:${info.title}` });
  return info;
}

/** Moderation reasons are mandatory and must be meaningful, not a single dot. */
export const MIN_REASON = 5;
export const reasonValid = (value: string) => value.trim().length >= MIN_REASON;

export const SYNC_LABEL: Record<string, string> = {
  synced: "Synced 🟢",
  pending: "Pending Sync 🟡",
  failed: "Sync Failed 🔴",
};

/** "07 Aug 2026" — unambiguous in every locale. */
export function shortDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function shortDateTime(value: string) {
  const d = new Date(value);
  return `${shortDate(value)} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

/** Vlagemoji + stad uit een ISO-landcode; onbekend blijft neutraal. */
export function locationBadge(country: string | null, city: string | null) {
  const code = country?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{2}$/.test(code)) return "🌐 Onbekend";
  const flag = String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  return `${flag} ${city?.trim() || code}`;
}

export const TIER_BADGE: Record<string, string> = {
  early_believer: "Early Believer",
};

export const PER_PAGE_OPTIONS = [10, 20, 50, 100];

// Darker text tones so every tag clears WCAG AA on its tinted background.
export const STATUS_STYLE: Record<string, string> = {
  paid: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  active: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  pending: "bg-amber-500/15 text-amber-900 dark:text-amber-200",
  failed: "bg-destructive/15 text-destructive",
  suspended: "bg-amber-500/15 text-amber-900 dark:text-amber-200",
  banned: "bg-destructive/15 text-destructive",
  matched: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  unmatched: "bg-amber-500/15 text-amber-900 dark:text-amber-200",
};
