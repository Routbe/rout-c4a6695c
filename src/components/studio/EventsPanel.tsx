import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { eventInputSchema, eventIsOver, eventPath } from "@/lib/event-engine";
import { changeProfileEvent, createProfileEvent, getMyEvents } from "@/lib/event-engine.functions";
import { getWorkspaceContext } from "@/lib/workspaces.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const toIso = (local: string) => (local ? new Date(local).toISOString() : null);

export function EventsPanel({ handle, space = "alias" }: { handle?: string; space?: "root" | "alias" }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const load = useServerFn(getMyEvents);
  const loadScope = useServerFn(getWorkspaceContext);
  const create = useServerFn(createProfileEvent);
  const change = useServerFn(changeProfileEvent);
  const scope = useQuery({ queryKey: ["workspace-context"], queryFn: () => loadScope(), enabled: Boolean(user), retry: false });
  const active = scope.data?.workspaces.find((w) => w.id === scope.data.activeWorkspaceId);
  const query = useQuery({ queryKey: ["my-events", scope.data?.activeWorkspaceId ?? null], queryFn: () => load(), enabled: Boolean(user) && scope.data?.available === true, retry: false });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: "", start: "", end: "", venue: "", description: "", ticketUrl: "" });
  const refresh = () => qc.invalidateQueries({ queryKey: ["my-events"] });
  async function mutate(id: string, action: "publish" | "delete", enabled = false) {
    setBusy(true);
    try { await change({ data: { id, action, enabled } }); await refresh(); }
    catch { toast.error(t("events.failed")); } finally { setBusy(false); }
  }
  if (!user) return <Button asChild variant="outline"><a href="/auth/sign-in">{t("events.signin")}</a></Button>;
  if (scope.isError || scope.data?.available === false) return <p role="status" className="text-sm text-muted-foreground">Workspaces tijdelijk niet beschikbaar.</p>;
  const events = query.data ?? [];
  return <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{t("events.title")}</h2><Button size="sm" onClick={() => setOpen(true)}><Plus className="size-4" />{t("events.new")}</Button></div>
    {(query.isPending || scope.isPending) && <p className="text-sm text-muted-foreground">{t("studio.common.loading")}</p>}
    {query.isSuccess && !events.length && <p className="text-sm text-muted-foreground">{t("events.empty")}</p>}
    {events.map((e) => <article key={e.id} className="space-y-2 rounded-lg border border-border p-3">
      <div className="min-w-0"><h3 className="break-words font-medium">{e.title}</h3><p className="text-xs text-muted-foreground">{new Date(e.startsAt).toLocaleString()}{e.venue && ` · ${e.venue}`}{eventIsOver(e) && ` · ${t("events.past")}`}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="icon" variant="ghost" aria-label={t("events.copy")} onClick={() => void navigator.clipboard.writeText(`${window.location.origin}${eventPath(e.slug)}`).then(() => toast.success(t("events.copied"))).catch(() => toast.error(t("events.failed")))}><Copy className="size-4" /></Button>
        <Button asChild size="sm" variant="outline"><a href={eventPath(e.slug)} target="_blank" rel="noopener noreferrer">QR</a></Button>
        <label className="flex items-center gap-2 text-xs"><Switch disabled={busy} checked={e.published} onCheckedChange={(v) => void mutate(e.id, "publish", v)} />{t("events.publish")}</label>
        <Button variant="ghost" size="icon" disabled={busy} aria-label={t("studio.common.delete")} onClick={() => { if (window.confirm(t("events.deleteConfirm"))) void mutate(e.id, "delete"); }}><Trash2 className="size-4" /></Button>
      </div>
    </article>)}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>{t("events.new")}</DialogTitle></DialogHeader>
      <form className="space-y-3" onSubmit={async (ev) => {
        ev.preventDefault();
        const parsed = eventInputSchema.safeParse({
          title: form.title, startsAt: toIso(form.start), endsAt: toIso(form.end), venue: form.venue,
          description: form.description, ticketUrl: form.ticketUrl,
          profileSpace: active ? "workspace" : space, profileHandle: active?.slug ?? handle ?? "",
        });
        if (!parsed.success) { toast.error(t("events.invalid")); return; }
        setBusy(true);
        try { await create({ data: parsed.data }); await refresh(); setOpen(false); setForm({ title: "", start: "", end: "", venue: "", description: "", ticketUrl: "" }); }
        catch { toast.error(t("events.failed")); } finally { setBusy(false); }
      }}>
        {([["title", "events.name", "text"], ["start", "events.start", "datetime-local"], ["end", "events.end", "datetime-local"], ["venue", "events.venue", "text"], ["ticketUrl", "events.tickets", "url"]] as const).map(([k, label, type]) =>
          <label key={k} className="block space-y-1 text-sm"><span>{t(label)}</span><Input type={type} required={k === "title" || k === "start"} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></label>)}
        <label className="block space-y-1 text-sm"><span>{t("events.description")}</span><textarea className="w-full rounded-lg border border-input bg-background p-2" maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <Button type="submit" disabled={busy} className="w-full">{t("events.save")}</Button>
      </form>
    </DialogContent></Dialog>
  </section>;
}
