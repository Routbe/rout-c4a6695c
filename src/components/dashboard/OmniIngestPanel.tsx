import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Copy, Link2, LoaderCircle, Plus, RefreshCw, KeyRound, Trash2, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dismissOmniJob, enqueueOmniUrl, getOmniRealtimeTicket, getIngestTokenStatus, listOmniIngestJobs, retryOmniJob, revokeIngestToken, rotateIngestToken } from "@/lib/omni-ingest.functions";
import { readyOmniItem, type OmniJob } from "@/lib/omni-ingest";
import type { SocialGridItem } from "@/lib/social-grid";

export function OmniIngestPanel({ onAdd, full }: { onAdd: (item: SocialGridItem) => void; full: boolean }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [title, setTitle] = useState("");
  const [override, setOverride] = useState(false);
  const [accepted, setAccepted] = useState<OmniJob[]>([]);
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [realtimeUnavailable, setRealtimeUnavailable] = useState(false);
  const tokenStatus = useQuery({ queryKey: ["omni-ingest-token"], queryFn: () => getIngestTokenStatus(), retry: false });
  const jobs = useQuery({ queryKey: ["omni-ingest-jobs"], queryFn: () => listOmniIngestJobs(), retry: false });
  const refetchJobs = jobs.refetch;
  useEffect(() => {
    if (!jobs.data) return;
    const ids = new Set(jobs.data.map((job) => job.id));
    setAccepted((previous) => previous.filter((job) => !ids.has(job.id)));
  }, [jobs.data]);
  const displayedJobs = [...accepted.filter((job) => !jobs.data?.some((row) => row.id === job.id)), ...(jobs.data ?? [])];
  useEffect(() => {
    const abort = new AbortController();
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let reading = false; let dirty = false;
    async function reconcile() {
      dirty = true;
      if (reading) return;
      reading = true;
      try {
        do { dirty = false; await refetchJobs({ cancelRefetch: false }); }
        while (dirty && !abort.signal.aborted);
      } finally { reading = false; }
    }
    async function connect() {
      try {
        const ticket = await getOmniRealtimeTicket();
        if (abort.signal.aborted) return;
        if (!ticket.configured) { setRealtimeUnavailable(true); return; }
        // POST keeps the ticket out of URLs, access logs and referrers.
        const response = await fetch(ticket.url, { method: "POST", headers: { Authorization: `Bearer ${ticket.token}` }, signal: abort.signal });
        if (!response.ok || !response.body) throw new Error("events_unavailable");
        setRealtimeUnavailable(false); failures = 0;
        const reader = response.body.getReader();
        const decoder = new TextDecoder(); let buffer = "";
        try {
          for (;;) {
            const chunk = await reader.read(); if (chunk.done) break;
            buffer += decoder.decode(chunk.value, { stream: true });
            let boundary = buffer.indexOf("\n\n");
            while (boundary >= 0) {
              const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
              // Read back through existing authenticated functions, never trust event data.
              if (/^event: (job|connected|reconnected)$/m.test(frame)) void reconcile();
              boundary = buffer.indexOf("\n\n");
            }
            if (buffer.length > 65536) throw new Error("invalid_event_stream");
          }
        } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
        if (!abort.signal.aborted) { setRealtimeUnavailable(true); failures++; }
      } catch {
        if (!abort.signal.aborted) { setRealtimeUnavailable(true); failures++; }
      }
      if (!abort.signal.aborted) reconnect = setTimeout(() => { void connect(); }, Math.min(30_000, 1000 * 2 ** failures));
    }
    void connect();
    return () => { abort.abort(); if (reconnect) clearTimeout(reconnect); };
  }, [refetchJobs]);
  const enqueue = useMutation({ mutationFn: () => enqueueOmniUrl({ data: { target_url: url, ...(mediaUrl.trim() ? { media_url: mediaUrl.trim() } : {}), ...(title.trim() ? { title: title.trim() } : {}) } }),
    onMutate: async () => {
      setError("");
      const id = `pending_${crypto.randomUUID()}`;
      const optimistic: OmniJob = { id, source: "studio", sourceUrl: url, status: "queued", title: title || null, contentType: null, metaTag: null, targetUrl: url, mediaUrl: null, kineticPreviewUrl: null, error: null, createdAt: new Date().toISOString() };
      setAccepted((previous) => [optimistic, ...previous]);
      return { id };
    }, onSuccess: async (result, _variables, optimistic) => {
      if (!result.ok || !result.jobId) {
        setAccepted((previous) => previous.filter((job) => job.id !== optimistic?.id));
        setError("omni.importUnavailable"); return;
      }
      setAccepted((previous) => previous.map((job) => job.id === optimistic?.id ? { ...job, id: result.jobId ?? job.id } : job));
      setUrl(""); setMediaUrl(""); setTitle(""); await jobs.refetch();
    }, onError: (_error, _variables, optimistic) => {
      setAccepted((previous) => previous.filter((job) => job.id !== optimistic?.id));
      setError("omni.invalidLink");
    } });
  const rotate = useMutation({ mutationFn: () => rotateIngestToken(), onSuccess: (result) => { setToken(result.token); setCopied(false); void tokenStatus.refetch(); },
    onError: () => setError("omni.tokenFailed") });
  const retry = useMutation({ mutationFn: (id: string) => retryOmniJob({ data: { id } }), onSuccess: () => jobs.refetch(),
    onError: () => setError("omni.retryUnavailable") });
  const dismiss = useMutation({ mutationFn: (id: string) => dismissOmniJob({ data: { id } }), onSuccess: () => jobs.refetch(), onError: () => setError("omni.deleteFailed") });
  const revoke = useMutation({ mutationFn: () => revokeIngestToken(), onSuccess: () => { setToken(""); setCopied(false); void tokenStatus.refetch(); }, onError: () => setError("omni.revokeFailed") });

  return <div className="space-y-3 border-b border-border pb-3">
    <form className="flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); if (!enqueue.isPending && !full && url.trim()) enqueue.mutate(); }}>
      <Input aria-label={t("omni.url")} placeholder="https://…" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} />
      <Button type="submit" size="icon" variant="outline" title={t("omni.import")} aria-label={t("omni.import")} disabled={!url.trim() || enqueue.isPending || full}>
        {enqueue.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
      </Button>
    </form>
    <Button variant="ghost" size="sm" onClick={() => setOverride((value) => !value)} aria-expanded={override}>{t("omni.override")}</Button>
    {override && <div className="space-y-2"><Input aria-label={t("omni.title")} placeholder={t("omni.titlePlaceholder")} maxLength={150} value={title} onChange={(event) => setTitle(event.target.value)} /><Input aria-label={t("omni.sourceImage")} placeholder="https://…" inputMode="url" value={mediaUrl} maxLength={2000} onChange={(event) => setMediaUrl(event.target.value)} /></div>}
    {error && <p role="alert" className="text-xs text-destructive">{t(error)}</p>}
    {jobs.isError && <p role="status" className="text-xs text-muted-foreground">{t("omni.inboxUnavailable")}</p>}
    {realtimeUnavailable && <div className="flex items-center gap-2"><p role="status" className="text-xs text-muted-foreground">{t("omni.liveUnavailable")}</p><Button size="icon" variant="ghost" title={t("omni.refresh")} aria-label={t("omni.refresh")} onClick={() => void jobs.refetch()}><RefreshCw className="h-4 w-4" /></Button></div>}
    <ul className="grid grid-cols-2 gap-2" aria-label={t("omni.inbox")}>
      {displayedJobs.filter((job) => !added.has(job.id)).map((job) => {
        const item = readyOmniItem(job);
        const pending = job.status === "queued" || job.status === "processing";
        return <li key={job.id} className="min-w-0 overflow-hidden rounded-md border border-border">
          <div className="aspect-square overflow-hidden bg-muted">{pending ? <div aria-label={t("omni.processing")} role="status" className="h-full w-full animate-pulse motion-reduce:animate-none" /> :
            item ? <img src={item.mediaUrl} alt="" className="h-full w-full object-cover animate-in fade-in duration-500 motion-reduce:animate-none" /> : <div className="flex h-full items-center justify-center"><Link2 className="h-5 w-5 text-muted-foreground" /></div>}</div>
          <div className="space-y-1 p-2"><div className="min-w-0"><p className="line-clamp-2 text-xs font-medium">{job.title || (() => { try { return new URL(job.sourceUrl).hostname; } catch { return t("omni.content"); } })()}</p>
            <p className="text-[10px] text-muted-foreground" role="status">{pending ? t("omni.processingShort") : item ? t(`studio.grid.type.${item.contentType}`) : t("omni.failed")}</p></div>
          <div className="flex justify-end">{item && <Button variant="ghost" size="icon" aria-label={t("omni.add")} title={t("omni.add")} disabled={full} onClick={() => { onAdd(item); setAdded((previous) => new Set([...previous, job.id])); }}><Plus className="h-4 w-4" /></Button>}
          {job.status === "failed" && <Button variant="ghost" size="icon" aria-label={t("omni.retry")} title={t("omni.retry")} disabled={retry.isPending} onClick={() => retry.mutate(job.id)}><RefreshCw className="h-4 w-4" /></Button>}
          {job.status === "failed" && <Button variant="ghost" size="icon" aria-label={t("omni.delete")} title={t("omni.delete")} disabled={dismiss.isPending} onClick={() => dismiss.mutate(job.id)}><Trash2 className="h-4 w-4" /></Button>}</div></div>
        </li>;
      })}
    </ul>
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" disabled={rotate.isPending} onClick={() => rotate.mutate()}><KeyRound className="h-3.5 w-3.5" />{token ? t("omni.renewToken") : t("omni.generate")}</Button>
      {(token || tokenStatus.data?.active) && <Button size="icon" variant="ghost" disabled={revoke.isPending} title={t("omni.revoke")} aria-label={t("omni.revoke")} onClick={() => revoke.mutate()}><ShieldOff className="h-4 w-4" /></Button>}
      {token && <Button size="icon" variant="ghost" title={t("omni.copy")} aria-label={t("omni.copy")} onClick={async () => {
        try { await navigator.clipboard.writeText(`${window.location.origin}/api/public/ingest/omni?token=${encodeURIComponent(token)}`); setCopied(true); }
        catch { setError("omni.copyFailed"); }
      }}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</Button>}
    </div>
  </div>;
}