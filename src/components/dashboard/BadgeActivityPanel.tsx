import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/db/client";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { formatSerial } from "@/lib/badges";

interface ActivityRow {
  id: string;
  badge_slug: string;
  action: string;
  source: string | null;
  serial_number: number | null;
  created_at: string;
}

/**
 * "Activity" table on the dashboard: the member's badge history — when a badge
 * landed, where it came from (subscription, SEPA, refund, referral, admin) and
 * status changes such as a revoked Supporter badge.
 */
export function BadgeActivityPanel() {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<ActivityRow[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = () =>
      void (
        db as unknown as {
          from: (t: string) => {
            select: (c: string) => {
              eq: (
                c: string,
                v: string,
              ) => {
                order: (
                  c: string,
                  o: { ascending: boolean },
                ) => { limit: (n: number) => Promise<{ data: unknown }> };
              };
            };
          };
        }
      )
        .from("badge_events")
        .select("id, badge_slug, action, source, serial_number, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(12)
        .then(({ data }) => {
          if (cancelled) return;
          setRows(Array.isArray(data) ? (data as ActivityRow[]) : []);
        })
        .catch(() => {
          if (!cancelled) setRows([]);
        });

    load();
    const channel = db
      .channel(`badge-activity-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "badge_events",
          filter: `user_id=eq.${user.id}`,
        },
        () => load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      void db.removeChannel(channel);
    };
  }, [user]);

  if (!rows || rows.length === 0) return null;

  const badgeName = (slug: string) => {
    const key = `badges.item.${slug.replace(/_/g, "-")}.name`;
    const value = t(key);
    return value === key ? slug.replace(/[-_]/g, " ") : value;
  };

  const sourceLabel = (source: string | null) => {
    if (!source) return "";
    const key = `activity.source.${source}`;
    const value = t(key);
    return value === key ? source : value;
  };

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <History className="h-4 w-4" aria-hidden />
        {t("activity.title")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("activity.body")}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="py-2 pr-3 font-medium">{t("activity.col.date")}</th>
              <th className="py-2 pr-3 font-medium">{t("activity.col.badge")}</th>
              <th className="py-2 pr-3 font-medium">{t("activity.col.source")}</th>
              <th className="py-2 font-medium">{t("activity.col.status")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/60 last:border-0">
                <td className="py-2 pr-3 text-xs text-muted-foreground">
                  {formatDate(row.created_at, locale)}
                </td>
                <td className="py-2 pr-3 text-xs">
                  {badgeName(row.badge_slug)}
                  {row.serial_number ? (
                    <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
                      {formatSerial(row.serial_number)}
                    </span>
                  ) : null}
                </td>
                <td className="py-2 pr-3 text-xs text-muted-foreground">
                  {sourceLabel(row.source)}
                </td>
                <td className="py-2 text-xs">
                  {t(`activity.action.${row.action}`) === `activity.action.${row.action}`
                    ? row.action
                    : t(`activity.action.${row.action}`)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
