import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Download, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/lib/db/client";
import { downloadCsv, toCsv } from "@/lib/csv";
import { selectTolerant } from "@/lib/optional-columns";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { i18n as trI18n } from "@/lib/i18n";

type MemberRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  tier: string;
  status: string;
  verified: boolean;
  verified_at: string | null;
  is_early_believer: boolean;
  is_paid: boolean;
  payment_method: string | null;
  verified_legal_name: string | null;
  created_at: string;
  badges: string[];
};

type BadgeEvent = {
  id: string;
  user_id: string;
  badge_slug: string;
  action: string;
  source: string;
  created_at: string;
};

const CSV_COLUMNS = [
  "handle",
  "display_name",
  "user_id",
  "tier",
  "status",
  "verified",
  "verified_at",
  "is_early_believer",
  "is_paid",
  "payment_method",
  "verified_legal_name",
  "badges",
  "created_at",
];

/**
 * Admin-only member status view: the single place to check why a member does
 * or does not see the blue check and their badges. Read-only on purpose —
 * granting and revoking stays in the verification tools, this is for support
 * and debugging, plus a CSV to hand off.
 */
export function MemberStatusPanel() {
  const { locale } = useI18n();
  const [rows, setRows] = useState<MemberRow[] | null>(null);
  const [events, setEvents] = useState<Record<string, BadgeEvent[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: profiles, error: pErr }, { data: grants, error: bErr }] = await Promise.all([
        selectTolerant(
          "id, username, display_name, tier, status, verified, verified_at, is_early_believer, is_paid, payment_method, verified_legal_name, created_at",
          (cols) =>
            db
              .from("profiles")
              .select(cols)
              .order("created_at", { ascending: false })
              .limit(500) as never,
        ) as never as Promise<{ data: MemberRow[] | null; error: { message: string } | null }>,
        db.from("user_badges").select("user_id, badges(slug)"),
      ]);
      if (pErr) throw new Error(pErr.message);
      if (bErr) throw new Error(bErr.message);

      const bySlug = new Map<string, string[]>();
      for (const row of grants ?? []) {
        const slug = (row as { badges?: { slug?: string } | null }).badges?.slug;
        if (!slug) continue;
        const key = (row as { user_id: string }).user_id;
        bySlug.set(key, [...(bySlug.get(key) ?? []), slug]);
      }

      setRows(
        (profiles ?? []).map((p) => ({
          ...(p as Omit<MemberRow, "badges">),
          badges: (bySlug.get(p.id as string) ?? []).sort(),
        })),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Kon leden niet laden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Badge history is fetched lazily: only for the member being inspected. */
  const loadEvents = useCallback(
    async (userId: string) => {
      if (events[userId]) return;
      const { data, error: eErr } = await db
        .from("badge_events")
        .select("id, user_id, badge_slug, action, source, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (eErr) {
        toast.error(trI18n.t("ui.ccb84075fb"));
        return;
      }
      setEvents((prev) => ({ ...prev, [userId]: (data ?? []) as BadgeEvent[] }));
    },
    [events],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !rows) return rows ?? [];
    return rows.filter((r) =>
      [r.username, r.display_name, r.id, r.verified_legal_name, r.badges.join(" ")]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, query]);

  const exportCsv = () => {
    const csv = toCsv(
      filtered.map((r) => ({
        handle: r.username ?? "",
        display_name: r.display_name ?? "",
        user_id: r.id,
        tier: r.tier,
        status: r.status,
        verified: r.verified ? "yes" : "no",
        verified_at: r.verified_at ?? "",
        is_early_believer: r.is_early_believer ? "yes" : "no",
        is_paid: r.is_paid ? "yes" : "no",
        payment_method: r.payment_method ?? "",
        verified_legal_name: r.verified_legal_name ?? "",
        badges: r.badges.join(" | "),
        created_at: r.created_at,
      })),
      CSV_COLUMNS,
    );
    downloadCsv(`rout-leden-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast.success(`${filtered.length} leden geëxporteerd`);
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[16rem] flex-1 space-y-1">
          <Label htmlFor="member-status-search" className="text-xs">
            Zoek op handle, naam, badge of user-id
          </Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="member-status-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="bv. early_believer"
              className="h-10 pl-9"
            />
          </div>
        </div>
        <Button type="button" variant="outline" className="h-10" onClick={() => void load()}>
          <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden /> Vernieuwen
        </Button>
        <Button type="button" className="h-10" disabled={filtered.length === 0} onClick={exportCsv}>
          <Download className="mr-1.5 h-4 w-4" aria-hidden /> CSV export
        </Button>
      </div>

      {loading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leden laden…
        </p>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm font-semibold">Laden mislukt</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 h-8 text-xs"
            onClick={() => void load()}
          >
            Opnieuw proberen
          </Button>
        </div>
      )}

      {!loading && !error && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[54rem] text-left text-sm">
            <caption className="sr-only">Lidstatus, verificatie en toegekende badges</caption>
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Lid
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Blue check
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Early Believer
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Betaald
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Badges
                </th>
                <th scope="col" className="py-2 font-semibold">
                  Historiek
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-3">
                    <p className="font-medium">@{r.username ?? "—"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {r.display_name ?? "—"} · {r.tier} · {r.status}
                    </p>
                  </td>
                  <td className="py-2 pr-3">
                    {r.verified ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold">
                        <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> ja
                        {r.verified_at && (
                          <span className="font-normal text-muted-foreground">
                            {formatDateTime(r.verified_at, locale)}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">nee</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-xs">{r.is_early_believer ? "ja" : "nee"}</td>
                  <td className="py-2 pr-3 text-xs">
                    {r.is_paid ? `ja${r.payment_method ? ` (${r.payment_method})` : ""}` : "nee"}
                  </td>
                  <td className="py-2 pr-3">
                    {r.badges.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {r.badges.map((b) => (
                          <span
                            key={b}
                            className="border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          >
                            {b}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      aria-expanded={open === r.id}
                      onClick={() => {
                        const next = open === r.id ? null : r.id;
                        setOpen(next);
                        if (next) void loadEvents(r.id);
                      }}
                    >
                      {open === r.id ? "Verbergen" : "Bekijken"}
                    </Button>
                    {open === r.id && (
                      <ul className="mt-1 space-y-0.5">
                        {(events[r.id] ?? []).length === 0 ? (
                          <li className="text-[11px] text-muted-foreground">Geen badge-events.</li>
                        ) : (
                          events[r.id].map((ev) => (
                            <li key={ev.id} className="text-[11px] text-muted-foreground">
                              {formatDateTime(ev.created_at, locale)} — {ev.badge_slug} {ev.action}{" "}
                              ({ev.source})
                            </li>
                          ))
                        )}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Geen leden gevonden.</p>
          )}
        </div>
      )}
    </section>
  );
}
