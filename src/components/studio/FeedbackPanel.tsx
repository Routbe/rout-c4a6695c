import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Plus, Trash2, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { FEEDBACK_TYPES, feedbackFormSchema, feedbackPath, type FeedbackForm, type FeedbackType } from "@/lib/feedback";
import { createFeedbackForm, getMyFeedback, changeFeedback } from "@/lib/feedback.functions";
import { getWorkspaceContext } from "@/lib/workspaces.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FeedbackCard } from "@/components/profile/FeedbackCard";

export function FeedbackPanel({ handle, space = "alias", onPick, picker = false }: { handle?: string; space?: "root" | "alias"; onPick?: (form: FeedbackForm) => void; picker?: boolean }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const load = useServerFn(getMyFeedback);
  const loadScope = useServerFn(getWorkspaceContext);
  const create = useServerFn(createFeedbackForm);
  const change = useServerFn(changeFeedback);
  const scope = useQuery({ queryKey: ["workspace-context"], queryFn: () => loadScope(), enabled: Boolean(user), retry: false });
  const active = scope.data?.workspaces.find(w => w.id === scope.data.activeWorkspaceId);
  const query = useQuery({ queryKey: ["my-feedback", scope.data?.activeWorkspaceId ?? null], queryFn: () => load(), enabled: Boolean(user) && scope.data?.available === true, retry: false });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<FeedbackType>("stars_5");
  const [fullPage, setFullPage] = useState(false);
  const [target, setTarget] = useState(handle ?? "");
  const [targetSpace, setTargetSpace] = useState<"root" | "alias">(space);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState("");
  const [view, setView] = useState("forms");
  const forms = query.data?.forms ?? [];
  const reviews = (query.data?.responses ?? []).filter(r => !selected || r.formId === selected);
  const refresh = () => qc.invalidateQueries({ queryKey: ["my-feedback"] });
  async function mutate(id: string, action: "feature" | "delete_response" | "delete_form" | "visibility", enabled = false) {
    setBusy(true);
    try { await change({ data: { id, action, enabled } }); await refresh(); }
    catch { toast.error(t("feedback.failed")); } finally { setBusy(false); }
  }
  if (!user) return <Button asChild variant="outline"><a href="/auth/sign-in">{t("feedback.signin")}</a></Button>;
  if (scope.isError || scope.data?.available === false) return <p role="status" className="text-sm text-muted-foreground">Workspaces tijdelijk niet beschikbaar.</p>;
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{t("feedback.title")}</h2><Button size="sm" onClick={() => { setTarget(handle ?? ""); setOpen(true); }}><Plus className="size-4" />{t("feedback.new")}</Button></div>
    {!picker && <div className="flex gap-2" role="tablist" aria-label={t("feedback.title")}>{["forms", "responses"].map(v => <Button key={v} role="tab" aria-selected={view === v} variant={view === v ? "default" : "ghost"} onClick={() => setView(v)}>{t(`feedback.${v}`)}</Button>)}</div>}
    {query.isError && <Button variant="outline" onClick={() => void refresh()}><RefreshCw className="size-4" />{t("feedback.retry")}</Button>}
    {(query.isPending || scope.isPending) && <p className="text-sm text-muted-foreground">{t("studio.common.loading")}</p>}
    {query.isSuccess && !forms.length && <p className="text-sm text-muted-foreground">{t("feedback.empty")}</p>}
    {(picker || view === "forms") && forms.map(f => <article key={f.id} className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words font-medium">{f.title}</h3><p className="text-xs text-muted-foreground">{f.average == null ? "—" : f.average.toFixed(1)}{f.type === "stars_5" ? " / 5 ★" : f.type === "nps_10" ? " / 10" : ""} · {f.count} {t("feedback.responses")}</p></div>
      {picker && <Button size="sm" onClick={() => onPick?.(f)}>{t("feedback.select")}</Button>}</div>
      {!picker && <div className="flex flex-wrap items-center gap-2">
        <Button size="icon" variant="ghost" aria-label={t("feedback.copy")} onClick={() => void navigator.clipboard.writeText(`${window.location.origin}${feedbackPath(f.slug)}`).then(() => toast.success(t("feedback.copied"))).catch(() => toast.error(t("feedback.failed")))}><Copy className="size-4" /></Button>
        <Button asChild size="sm" variant="outline"><a href={`/qr?type=feedback&form=${encodeURIComponent(f.id)}`}>QR</a></Button>
        <label className="flex items-center gap-2 text-xs"><Switch disabled={busy} checked={f.showOnProfile} onCheckedChange={v => void mutate(f.id, "visibility", v)} />{t("feedback.show")}</label>
        <Button variant="ghost" size="icon" disabled={busy} aria-label={t("studio.common.delete")} onClick={() => { if (window.confirm(t("feedback.deleteConfirm"))) void mutate(f.id, "delete_form"); }}><Trash2 className="size-4" /></Button>
      </div>}
    </article>)}
    {!picker && view === "responses" && <>
      <select className="w-full rounded-lg border border-input bg-background p-2 text-sm" aria-label={t("feedback.forms")} value={selected} onChange={e => setSelected(e.target.value)}><option value="">{t("feedback.all")}</option>{forms.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}</select>
      {!!reviews.length && <Button variant="outline" size="sm" onClick={() => {
        const blob = new Blob([JSON.stringify(reviews, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = "rout-feedback.json"; a.click(); URL.revokeObjectURL(url);
      }}><Download className="size-4" />{t("feedback.export")}</Button>}
      {!reviews.length && <p className="text-sm text-muted-foreground">{t("feedback.noResponses")}</p>}
      {reviews.map(r => <article key={r.id} className="space-y-2 rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">{forms.find(f => f.id === r.formId)?.title} · {new Date(r.createdAt).toLocaleDateString()}</p><p className="break-words text-sm">{r.rating != null && `${r.rating} · `}{r.comment}</p><p className="text-xs">{r.reviewerName || t("feedback.anonymous")}</p><div className="flex items-center justify-between gap-2"><label className="flex items-center gap-2 text-xs"><Switch disabled={busy || !r.allowFeatured} checked={r.isFeatured} onCheckedChange={v => void mutate(r.id, "feature", v)} />{t(r.allowFeatured ? "feedback.show" : "feedback.noConsent")}</label><Button size="icon" variant="ghost" disabled={busy} aria-label={t("studio.common.delete")} onClick={() => { if (window.confirm(t("feedback.deleteConfirm"))) void mutate(r.id, "delete_response"); }}><Trash2 className="size-4" /></Button></div></article>)}
    </>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>{t("feedback.new")}</DialogTitle></DialogHeader>
      <form className="space-y-3" onSubmit={async e => {
        e.preventDefault(); setBusy(true);
        const parsed = feedbackFormSchema.safeParse({ title, type, fullPage, profileSpace: active ? "workspace" : targetSpace, profileHandle: active?.slug ?? target });
        if (!parsed.success) { toast.error(t("feedback.invalid")); setBusy(false); return; }
        try { const f = await create({ data: parsed.data }); await refresh(); setOpen(false); setTitle(""); onPick?.(f); }
        catch { toast.error(t("feedback.failed")); } finally { setBusy(false); }
      }}>
        <label className="block space-y-1 text-sm"><span>{t("feedback.question")}</span><Input required value={title} maxLength={160} onChange={e => setTitle(e.target.value)} /></label>
        <label className="block space-y-1 text-sm"><span>{t("feedback.type")}</span><select className="w-full rounded-lg border border-input bg-background p-2" value={type} onChange={e => setType(FEEDBACK_TYPES.find(v => v === e.target.value) ?? "stars_5")}>{FEEDBACK_TYPES.map(v => <option key={v} value={v}>{t(`feedback.type.${v}`)}</option>)}</select></label>
        {!active && <><label className="block space-y-1 text-sm"><span>{t("feedback.profile")}</span><select className="w-full rounded-lg border border-input bg-background p-2" value={targetSpace} onChange={e => setTargetSpace(e.target.value === "root" ? "root" : "alias")}><option value="alias">{t("studio.profile.alias")}</option><option value="root">{t("studio.profile.verified")}</option></select></label><Input aria-label={t("feedback.handle")} placeholder={t("feedback.handle")} value={target} onChange={e => setTarget(e.target.value)} required maxLength={64} /></>}
        <label className="flex items-center gap-2 text-sm"><Switch checked={fullPage} onCheckedChange={setFullPage} />{t("feedback.fullPage")}</label>
        <Button disabled={busy} type="submit">{t("feedback.create")}</Button>
      </form>
      {title && <FeedbackCard preview item={{ form: { id: "preview", slug: "preview", title, type, showOnProfile: true, fullPage, profileHandle: target, profileSpace: targetSpace, count: 0, average: null }, featured: [] }} />}
    </DialogContent></Dialog>
  </section>;
}

export function FeedbackPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return <><Button type="button" variant="outline" onClick={() => setOpen(true)}>{t(value ? "feedback.change" : "feedback.select")}</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>{t("feedback.forms")}</DialogTitle></DialogHeader><FeedbackPanel picker onPick={f => { onChange(f.id); setOpen(false); }} /></DialogContent></Dialog></>;
}