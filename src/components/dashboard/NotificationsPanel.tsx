import { useEffect, useState } from "react";
import { Bell, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/db/client";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  severity: string;
  read_at: string | null;
  created_at: string;
}

/**
 * In-app notification inbox. Rows are written server-side by the payment
 * webhooks (in the member's own language) and stream in over realtime, so a
 * cleared SEPA debit or a failed card shows up without a refresh.
 */
export function NotificationsPanel() {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<NotificationRow[] | null>(null);

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
        .from("notifications")
        .select("id, kind, title, body, severity, read_at, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10)
        .then(({ data }) => {
          if (cancelled) return;
          setRows(Array.isArray(data) ? (data as NotificationRow[]) : []);
        })
        .catch(() => {
          if (!cancelled) setRows([]);
        });

    load();
    const channel = db
      .channel(`notifications-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      void db.removeChannel(channel);
    };
  }, [user]);

  const markRead = async (id: string) => {
    setRows((prev) =>
      (prev ?? []).map((r) => (r.id === id ? { ...r, read_at: new Date().toISOString() } : r)),
    );
    try {
      await (
        db as unknown as {
          from: (t: string) => {
            update: (v: Record<string, unknown>) => {
              eq: (c: string, v: string) => Promise<unknown>;
            };
          };
        }
      )
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
    } catch {
      /* optimistic update stays — the next load reconciles */
    }
  };

  if (!rows || rows.length === 0) return null;

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <Bell className="h-4 w-4" aria-hidden />
          {t("notifications.title")}
        </h2>
        <span className="text-xs text-muted-foreground">
          {t("notifications.unread", { count: rows.filter((r) => !r.read_at).length })}
        </span>
      </div>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.id}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-3",
              row.read_at ? "border-border opacity-70" : "border-foreground/25 bg-background",
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{row.title}</p>
              {row.body ? (
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{row.body}</p>
              ) : null}
              <p className="mt-1 text-[11px] text-muted-foreground">
                {formatDateTime(row.created_at, locale)}
              </p>
            </div>
            {row.read_at ? null : (
              <button
                type="button"
                onClick={() => void markRead(row.id)}
                aria-label={t("notifications.markRead")}
                className="shrink-0 rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground"
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
