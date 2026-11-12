import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Copy, EyeOff, Link2, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Link } from "@/lib/router-compat";
import { useAuth } from "@/hooks/useAuth";
import {
  createCalendar,
  deleteCalendar,
  listMyCalendars,
  listMyEventTypes,
  setCalendarActive,
  type CalendarMode,
  type RoutCalendar,
} from "@/lib/calendars.functions";
import { i18n as trI18n } from "@/lib/i18n";

const TITLE = "Agenda & Boekingen";
const DESC = "Beheer je gekoppelde en soevereine agenda's en boekingspagina's.";

export const Route = createFileRoute("/_authenticated/agenda")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgendaPage,
});

function publicUrl(c: RoutCalendar, handle: string | null): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://rout.be";
  return c.mode === "sovereign" ? `${origin}/a/${c.publicId}` : `${origin}/u/${handle ?? "jij"}/agenda`;
}

function AgendaPage() {
  const { user } = useAuth();
  const handle = (user as { username?: string | null } | null)?.username ?? null;
  const qc = useQueryClient();
  const list = useServerFn(listMyCalendars);
  const types = useServerFn(listMyEventTypes);
  const create = useServerFn(createCalendar);
  const toggle = useServerFn(setCalendarActive);
  const remove = useServerFn(deleteCalendar);
  const cals = useQuery({ queryKey: ["rout-calendars"], queryFn: () => list() });
  const ets = useQuery({ queryKey: ["rout-event-types"], queryFn: () => types() });
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<CalendarMode>("sovereign");
  const [eventTypeId, setEventTypeId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["rout-calendars"] });

  return (
    <AppLayout title={TITLE} description={DESC} width="wide"
      actions={<Button asChild variant="outline" size="sm"><Link to="/studio/booking">Afspraaktypes & beschikbaarheid</Link></Button>}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section data-tour="agenda-list" className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Je agenda's</h2>
          {cals.isLoading ? (
            <Loader2 className="mt-4 h-4 w-4 animate-spin text-muted-foreground" />
          ) : cals.error ? (
            <p className="mt-4 text-sm text-muted-foreground">Agenda's konden niet laden. Is het databasescript voor agenda's al uitgevoerd?</p>
          ) : !cals.data?.length ? (
            <p className="mt-4 text-sm text-muted-foreground">Nog geen agenda's. Maak er rechts één aan.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
              {cals.data.map((c) => {
                const url = publicUrl(c, handle);
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                    {c.mode === "sovereign" ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Link2 className="h-4 w-4 text-muted-foreground" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{c.title}</span>
                      <span className="block truncate font-mono text-[11px] text-muted-foreground">{url}</span>
                    </span>
                    <Button size="icon" variant="ghost" aria-label="Link kopiëren" onClick={() => { void navigator.clipboard.writeText(url); toast.success(trI18n.t("ui.f3042d3d49")); }}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Switch checked={c.isActive} aria-label="Actief" onCheckedChange={async (v) => { await toggle({ data: { id: c.id, active: v } }); void refresh(); }} />
                    <Button size="icon" variant="ghost" aria-label="Verwijderen" onClick={async () => { await remove({ data: { id: c.id } }); void refresh(); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <form
          className="space-y-3 rounded-2xl border border-border bg-card p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) return;
            setBusy(true);
            try {
              await create({ data: { title: title.trim(), mode, eventTypeId: eventTypeId || null } });
              setTitle("");
              toast.success(trI18n.t("ui.3aec3b646d"));
              void refresh();
            } catch {
              toast.error(trI18n.t("ui.2ec5a057cd"));
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2 className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" /> Nieuwe agenda
          </h2>
          <Input data-tour="agenda-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bijv. Kennismaking 15 min" maxLength={120} aria-label="Titel" />
          <div data-tour="agenda-mode" className="grid grid-cols-2 gap-2">
            {(["sovereign", "linked"] as const).map((m) => (
              <button type="button" key={m} onClick={() => setMode(m)}
                className={`rounded-xl border p-3 text-left text-xs ${mode === m ? "border-foreground bg-muted/50" : "border-border"}`}>
                <span className="block font-medium text-foreground">{m === "sovereign" ? "Soeverein" : "Gekoppeld"}</span>
                <span className="mt-0.5 block font-mono text-muted-foreground">{m === "sovereign" ? "/a/…" : "/u/naam/agenda"}</span>
              </button>
            ))}
          </div>
          <select value={eventTypeId} onChange={(e) => setEventTypeId(e.target.value)} aria-label="Afspraaktype"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Afspraaktype kiezen…</option>
            {(ets.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
          <p className="text-xs text-muted-foreground">
            {mode === "sovereign" ? "Een onherleidbare link: bezoekers zien niet wie de agenda beheert." : "Zichtbaar op je publieke identiteit."}
          </p>
          <Button data-tour="agenda-create" type="submit" className="w-full gap-1.5" disabled={busy || !title.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Aanmaken
          </Button>
        </form>
      </div>
    </AppLayout>
  );
}
