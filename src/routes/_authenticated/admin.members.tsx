import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Search } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { profileUrl } from "@/lib/app-domains";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { listUsers } from "@/lib/admin.functions";
import { adminGetMember360, adminSetMemberStatus } from "@/lib/admin-members.functions";
import { memberStatus, SETTABLE_STATUSES, type SettableStatus } from "@/lib/admin-members-rules";
import { useAuth } from "@/hooks/useAuth";
import { notifyError, notifySuccess } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { AdminGrantVerificationDialog } from "@/components/admin/AdminGrantVerificationDialog";

export const Route = createFileRoute("/_authenticated/admin/members")({
  head: () => ({
    meta: [
      { title: "Leden 360° | ROUT beheer" },
      { name: "description", content: "Zoek leden, bekijk hun identiteiten en sessies en pas hun status aan." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Leden 360° | ROUT beheer" },
      { property: "og:description", content: "Zoek leden, bekijk hun identiteiten en sessies en pas hun status aan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search["q"] === "string" && search["q"] ? { q: search["q"].slice(0, 120) } : {},
  component: MembersPage,
});

type Page = Awaited<ReturnType<typeof listUsers>>;
type Member = NonNullable<Awaited<ReturnType<typeof adminGetMember360>>>;
type Filter = "all" | "active" | "frozen" | "shadowbanned";

const STATUS_LABEL: Record<string, string> = {
  active: "Actief",
  frozen: "Bevroren",
  shadowbanned: "Shadowbanned",
  suspended: "Geschorst",
  banned: "Verbannen",
};
const FILTERS: Filter[] = ["all", "active", "frozen", "shadowbanned"];
const fmt = (v: string | null) => (v ? new Date(v).toLocaleString("nl-BE") : "—");

function MembersPage() {
  const { user } = useAuth();
  const myId = (user as { id?: string } | null)?.id ?? null;
  const { q } = Route.useSearch();
  const [query, setQuery] = useState(q ?? "");
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>("all");
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await listUsers({ data: { query: query || undefined, page, perPage: 25, memberStatus: filter === "all" ? undefined : filter } }));
      setError(false);
    } catch {
      setError(true);
    }
  }, [query, page, filter]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const rows = data?.rows ?? [];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;

  return (
    <AppLayout
      title="Leden 360°"
      description="Klik op een lid voor het volledige overzicht: status, identiteiten, badges en sessies."
      crumbs={[{ label: "Beheer", to: "/admin" }, { label: "Leden 360°" }]}
      width="wide"
    >
      {error ? (
        <p className="text-sm text-muted-foreground">Je hebt geen recht om leden te bekijken.</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input
                className="pl-8"
                placeholder="Zoek op handle, e-mail of ID…"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              />
            </div>
            <div className="flex rounded-lg border border-border p-0.5">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => { setFilter(f); setPage(1); }}
                  className={cn("rounded-md px-3 py-1 text-xs", filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {f === "all" ? "Alle" : STATUS_LABEL[f]}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-border rounded-2xl border border-border bg-card">
            {!data && <p className="p-4 text-sm text-muted-foreground">Laden…</p>}
            {data && rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">Geen leden gevonden.</p>}
            {rows.map((r) => {
              const s = memberStatus({ status: r.status, is_banned: r.isBanned, is_suspended: r.isSuspended, is_shadowbanned: r.isShadowbanned });
              return (
                <button key={r.userId} type="button" onClick={() => setOpenId(r.userId)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-secondary/50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.displayName ?? r.username ?? "Naamloos"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.username ? `@${r.username}` : "geen handle"} · {r.email ?? "geen e-mail"}
                    </p>
                  </div>
                  {r.verified ? <Badge>Geverifieerd</Badge> : <Badge variant="outline">Niet geverifieerd</Badge>}
                  <Badge variant={s === "active" ? "secondary" : "destructive"}>{STATUS_LABEL[s]}</Badge>
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>{data ? `${data.total} leden` : ""}</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Vorige</Button>
              <span>{page} / {pages}</span>
              <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Volgende</Button>
            </div>
          </div>
        </>
      )}

      <MemberSheet userId={openId} myId={myId} onClose={() => setOpenId(null)} onChanged={load} />
    </AppLayout>
  );
}

function MemberSheet({ userId, myId, onClose, onChanged }: { userId: string | null; myId: string | null; onClose: () => void; onChanged: () => void }) {
  const [m, setM] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);
  const [grantOpen, setGrantOpen] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setM(null);
    try {
      setM(await adminGetMember360({ data: { userId } }));
    } catch {
      notifyError("Lid laden mislukt");
    }
  }, [userId]);
  useEffect(() => void load(), [load]);

  async function setStatus(status: SettableStatus) {
    if (!userId) return;
    setBusy(true);
    try {
      await adminSetMemberStatus({ data: { userId, status } });
      notifySuccess(`Status: ${STATUS_LABEL[status]}`);
      await load();
      onChanged();
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Wijzigen mislukt");
    } finally {
      setBusy(false);
    }
  }

  const self = userId !== null && userId === myId;

  return (
    <Sheet open={userId !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{m?.displayName ?? m?.handle ?? "Lid"}</SheetTitle>
          <SheetDescription>{m ? `${m.handle ? `@${m.handle} · ` : ""}${m.email ?? "geen e-mail"}` : "Laden…"}</SheetDescription>
        </SheetHeader>
        {m && (
          <div className="mt-6 space-y-6 text-sm">
            <Section title="Status">
              <p className="mb-2 text-muted-foreground">Huidig: <strong className="text-foreground">{STATUS_LABEL[m.status]}</strong> · lid sinds {fmt(m.createdAt)}</p>
              <div className="flex flex-wrap gap-2">
                {SETTABLE_STATUSES.map((s) => (
                  <Button key={s} size="sm" variant={m.status === s ? "default" : "outline"} disabled={busy || self || m.status === s} onClick={() => setStatus(s)}>
                    {STATUS_LABEL[s]}
                  </Button>
                ))}
              </div>
              {self && <p className="mt-2 text-xs text-muted-foreground">Je kunt je eigen account niet modereren.</p>}
              {m.handle && (
                <a href={profileUrl(m.handle)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  Publiek profiel <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <div className="mt-3">
                <Button size="sm" onClick={() => setGrantOpen(true)}>Verifiëren</Button>
              </div>
              {userId && (
                <AdminGrantVerificationDialog userId={userId} open={grantOpen} onOpenChange={setGrantOpen}
                  onDone={() => { void load(); onChanged(); }} />
              )}
            </Section>

            <Section title="Inlogaccounts">
              {m.identities.length === 0 ? <Empty /> : (
                <ul className="space-y-1">
                  {m.identities.map((i) => (
                    <li key={i.id} className="flex items-center gap-2"><Badge variant="secondary">{i.provider}</Badge><span className="text-muted-foreground">{i.label ?? ""}</span></li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Open-web accounts">
              {m.openWeb.length === 0 ? <Empty /> : (
                <ul className="space-y-1">
                  {m.openWeb.map((o) => (
                    <li key={o.provider} className="flex items-center gap-2">
                      <span className="font-medium">{o.provider}</span>
                      <span className="text-muted-foreground">{o.handle ?? ""}</span>
                      {o.verified ? <Badge>geverifieerd · {o.via ?? "?"}</Badge> : <Badge variant="outline">niet geverifieerd</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Wapenschilden & badges">
              {m.badges.length === 0 ? <Empty /> : (
                <ul className="space-y-1">
                  {m.badges.map((b, i) => (
                    <li key={`${b.name}-${i}`} className="flex justify-between"><span>{b.name}</span><span className="text-muted-foreground">{fmt(b.grantedAt)}</span></li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Sessies">
              <p className="mb-2 text-muted-foreground">Laatste login: {fmt(m.lastLogin)}</p>
              {m.sessions.length === 0 ? <Empty /> : (
                <ul className="space-y-2">
                  {m.sessions.map((s, i) => (
                    <li key={i} className="rounded-lg border border-border p-2 text-xs">
                      <p>{fmt(s.lastSeen)} · {s.ip ?? "onbekend IP"}</p>
                      <p className="truncate text-muted-foreground">{s.userAgent ?? ""}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}
const Empty = () => <p className="text-muted-foreground">Niets gevonden.</p>;
