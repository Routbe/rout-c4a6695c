import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { EyeOff, Loader2, MessageCircleReply, MoreHorizontal, Send, Share2, Sparkles, Trash2, VolumeX } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  answerMyQuestion,
  deleteMyQuestion,
  getMyNewQuestions,
  getMyQaInsights,
  getMyQaOwners,
  getMyQuestions,
  muteSenderOfQuestion,
  unpublishMyQuestion,
} from "@/lib/questions.functions";
import { ANSWER_MAX } from "@/lib/questions-rules";
import { storedPromptLabel } from "@/lib/qa/prompts";
import { fuzzyArrival } from "@/lib/qa/privacy-keys";
import { needsCrisisHelp } from "@/lib/qa/crisis";
import { QaCrisisHelp } from "./QaCrisisHelp";
import { INBOX_PAGE_SIZE, INBOX_SYNC_MS, UNDO_DELETE_MS, answerRatio, filterInbox, mergeNewest, type InboxFilter } from "@/lib/qa/inbox-rules";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { QaShareDialog, type QaShareTarget } from "./QaShareDialog";
import type { QaSpace } from "./useQaPublic";

const FILTERS: InboxFilter[] = ["all", "open", "answered"];
const LEAVE_MS = 200;

/**
 * The Void Inbox: dark bento cards with three actions per message — answer
 * publicly, share as a story, or shadow-mute the unknown sender. The mute call
 * carries only the message id; who sent it is never known to this screen.
 * Keyset pages load as the list nears its end; deletes are optimistic with a
 * five-second undo before the database row is removed.
 */
export function QaInbox({ space, limit, compact = false }: {
  /** null = every canvas (Command Center), otherwise one Studio canvas. */
  space: QaSpace | null;
  limit?: number;
  compact?: boolean;
}) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const fetchMine = useServerFn(getMyQuestions);
  const fetchNew = useServerFn(getMyNewQuestions);
  const fetchInsights = useServerFn(getMyQaInsights);
  const answer = useServerFn(answerMyQuestion);
  const unpublish = useServerFn(unpublishMyQuestion);
  const del = useServerFn(deleteMyQuestion);
  const mute = useServerFn(muteSenderOfQuestion);
  const fetchOwners = useServerFn(getMyQaOwners);
  const scroll = !limit;
  const q = useInfiniteQuery({
    queryKey: ["my-questions", space ?? "all", limit ?? "all"],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchMine({ data: { space, before: pageParam, limit: limit ?? INBOX_PAGE_SIZE } }),
    getNextPageParam: (last) => (scroll ? last.next ?? undefined : undefined),
    retry: false,
  });
  const insightsQ = useQuery({ queryKey: ["my-qa-insights", space ?? "all"], queryFn: () => fetchInsights({ data: { space } }), retry: false, staleTime: 30_000 });
  const ownersQ = useQuery({ queryKey: ["my-qa-owners"], queryFn: () => fetchOwners(), staleTime: 300_000, retry: false });
  const owners = ownersQ.data?.owners ?? {};
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [replying, setReplying] = useState<string | null>(null);
  const [muteId, setMuteId] = useState<string | null>(null);
  const [share, setShare] = useState<{ target: QaShareTarget; space: QaSpace } | null>(null);
  const [filter, setFilter] = useState<InboxFilter>("all");
  type Item = NonNullable<typeof q.data>["pages"][number]["questions"][number];
  const [arrived, setArrived] = useState<Item[]>([]);
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(new Set());
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
  const pending = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const loaded = useMemo(() => mergeNewest(arrived, q.data?.pages.flatMap((p) => p.questions) ?? []), [arrived, q.data]);
  const visible = useMemo(() => filterInbox(loaded, filter, hidden), [loaded, filter, hidden]);
  const items = limit ? visible.slice(0, limit) : visible;
  const refresh = useCallback(() => {
    setArrived([]);
    void qc.invalidateQueries({ queryKey: ["my-questions"] });
    void qc.invalidateQueries({ queryKey: ["my-qa-insights"] });
  }, [qc]);

  // Infinite scroll: one observer on the sentinel, rebuilt only when paging state changes.
  const sentinel = useRef<HTMLLIElement | null>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  useEffect(() => {
    const el = sentinel.current;
    if (!scroll || !el || !hasNextPage || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
    }, { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [scroll, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Live arrivals: a small "newer than the top card" check while the inbox is visible.
  const newest = loaded[0];
  const newestRef = useRef(newest);
  const fetchNewRef = useRef(fetchNew);
  fetchNewRef.current = fetchNew;
  const tRef = useRef(t);
  tRef.current = t;
  newestRef.current = newest;
  useEffect(() => {
    if (!q.isSuccess) return;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const top = newestRef.current;
        if (!top) { void qc.invalidateQueries({ queryKey: ["my-questions", space ?? "all"] }); return; }
        const { questions } = await fetchNewRef.current({ data: { space, after: top.id } });
        if (questions.length === 0) return;
        setArrived((prev) => mergeNewest(questions, prev));
        setFreshIds(new Set(questions.map((x) => x.id)));
        void qc.invalidateQueries({ queryKey: ["my-qa-insights"] });
        if (!compact) toast(tRef.current("pages.qa.inbox.newArrival"));
      } catch {
        /* offline or signed out: the next tick retries */
      } finally {
        busy = false;
      }
    };
    const id = setInterval(() => void check(), INBOX_SYNC_MS);
    const onVisible = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [q.isSuccess, space, compact, qc]);

  // Leaving the screen commits any delete still waiting for undo.
  const delRef = useRef(del);
  delRef.current = del;
  useEffect(() => {
    const map = pending.current;
    return () => {
      for (const [id, timer] of map) { clearTimeout(timer); void delRef.current({ data: { id } }).catch(() => undefined); }
      map.clear();
    };
  }, []);

  const publish = async (id: string) => {
    const text = drafts[id] ?? loaded.find((i) => i.id === id)?.answer ?? "";
    try {
      const { result } = await answer({ data: { id, answer: text, publish: true } });
      if (result === "ok") {
        toast.success(t("pages.qa.inbox.published"));
        setReplying(null);
        refresh();
      } else toast.error(t("pages.qa.inbox.required"));
    } catch {
      toast.error(t("pages.qa.inbox.failed"));
    }
  };

  const confirmMute = async () => {
    const id = muteId;
    setMuteId(null);
    if (!id) return;
    try {
      const { ok } = await mute({ data: { id } });
      if (!ok) throw new Error("mute_failed");
      toast.success(t("pages.qa.inbox.muted"), { duration: 7000 });
      refresh();
      void qc.invalidateQueries({ queryKey: ["my-qa-mutes"] });
    } catch {
      toast.error(t("pages.qa.inbox.failed"));
    }
  };

  const without = (set: ReadonlySet<string>, id: string) => { const n = new Set(set); n.delete(id); return n; };
  const remove = (id: string) => {
    if (pending.current.has(id)) return;
    setLeaving((s) => new Set(s).add(id));
    setTimeout(() => { setHidden((s) => new Set(s).add(id)); setLeaving((s) => without(s, id)); }, LEAVE_MS);
    const timer = setTimeout(async () => {
      pending.current.delete(id);
      try {
        await del({ data: { id } });
        setArrived((prev) => prev.filter((x) => x.id !== id));
        refresh();
      } catch {
        setHidden((s) => without(s, id));
        toast.error(t("pages.qa.inbox.failed"));
      }
    }, UNDO_DELETE_MS);
    pending.current.set(id, timer);
    toast(t("pages.qa.inbox.deleted"), {
      duration: UNDO_DELETE_MS,
      action: {
        label: t("pages.qa.inbox.undo"),
        onClick: () => {
          const tm = pending.current.get(id);
          if (!tm) return;
          clearTimeout(tm);
          pending.current.delete(id);
          setLeaving((s) => without(s, id));
          setHidden((s) => without(s, id));
          setFreshIds(new Set([id]));
        },
      },
    });
  };

  if (q.isLoading) return <div className="h-24 animate-pulse rounded-2xl bg-muted" aria-hidden />;
  if (q.isError && !q.data) {
    return (
      <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        <span>{t("pages.qa.loadFailed")}</span>
        <button type="button" onClick={() => void q.refetch()} className="min-h-9 rounded-full border border-border px-3 font-medium text-foreground">{t("pages.qa.retry")}</button>
      </div>
    );
  }

  const shareOwner = share ? owners[share.space] : undefined;
  const now = new Date();
  const arrivalText = (iso: string) => {
    if (!iso) return "";
    const label = fuzzyArrival(new Date(iso), now);
    return label.key === "month"
      ? label.date.toLocaleDateString(locale, { month: "long", year: "numeric" })
      : t(`pages.qa.inbox.when.${label.key}`);
  };
  const ins = insightsQ.data?.ready ? insightsQ.data : null;
  const ratio = ins ? answerRatio(ins.answered, ins.total) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <dl className="flex items-center gap-3 text-xs text-muted-foreground" aria-label={t("pages.qa.inbox.insights")}>
          <div className="flex items-baseline gap-1"><dt className="sr-only">{t("pages.qa.inbox.insightsWeekLabel")}</dt><dd className="font-semibold tabular-nums text-foreground">{ins?.week ?? "–"}</dd><span>{t("pages.qa.inbox.insightsWeek")}</span></div>
          <span aria-hidden className="h-3 w-px bg-border" />
          <div className="flex items-baseline gap-1"><dt className="sr-only">{t("pages.qa.inbox.insightsRatioLabel")}</dt><dd className="font-semibold tabular-nums text-foreground">{ratio === null ? "–" : `${ratio}%`}</dd><span>{t("pages.qa.inbox.insightsRatio")}</span></div>
        </dl>
        {!compact && (
          <div role="tablist" aria-label={t("pages.qa.inbox.filterLabel")} className="inline-flex select-none rounded-full border border-border bg-muted p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  "min-h-8 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors",
                  filter === f && "bg-background text-foreground shadow-sm",
                )}
              >
                {t(`pages.qa.inbox.filter.${f}`)}
              </button>
            ))}
          </div>
        )}
      </div>
      {items.length === 0 && <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">{t(filter === "all" ? "pages.qa.inbox.empty" : "pages.qa.inbox.emptyFilter")}</p>}
      <ul className={cn("grid gap-3", !compact && "sm:grid-cols-2")}>
        {items.map((it) => {
          const owner = owners[it.space];
          const prompt = storedPromptLabel(it.prompt, t);
          const isReplying = replying === it.id;
          return (
            <li
              key={it.id}
              className={cn(
                "dark flex select-none flex-col rounded-2xl border border-border bg-background p-4 text-foreground shadow-sm",
                freshIds.has(it.id) && "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-300",
                leaving.has(it.id) && "motion-safe:animate-out motion-safe:fade-out motion-safe:slide-out-to-right-4 motion-safe:duration-200 fill-mode-forwards",
              )}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    {prompt && <span className="truncate">{prompt}</span>}
                    {space === null && <span className="rounded-full border border-border px-1.5">{t(`pages.qa.inbox.space.${it.space}`)}</span>}
                    {it.styleMasked && <span className="inline-flex items-center gap-1 rounded-full border border-border px-1.5"><Sparkles className="h-3 w-3" aria-hidden />{t("pages.qa.inbox.masked")}</span>}
                    {it.published && <span className="rounded-full bg-story-ring/20 px-1.5 text-story-ring">{t("pages.qa.inbox.live")}</span>}
                  </p>
                  <p className="mt-1.5 break-words text-[15px] font-medium leading-snug">{it.body}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{arrivalText(it.arrivedAt)}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={t("pages.qa.inbox.actions")}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setReplying(it.id)}><MessageCircleReply className="mr-2 h-4 w-4" />{t("pages.qa.inbox.answer")}</DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!owner}
                      onSelect={() => setShare({ space: it.space, target: { kind: "answer", question: it.body, answer: it.answer ?? "" } })}
                    >
                      <Share2 className="mr-2 h-4 w-4" />{t("pages.qa.inbox.share")}
                    </DropdownMenuItem>
                    {it.published && (
                      <DropdownMenuItem onSelect={async () => { try { await unpublish({ data: { id: it.id } }); } catch { toast.error(t("pages.qa.inbox.failed")); } void refresh(); }}>
                        <EyeOff className="mr-2 h-4 w-4" />{t("pages.qa.inbox.hide")}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setMuteId(it.id)} className="text-destructive focus:text-destructive">
                      <VolumeX className="mr-2 h-4 w-4" />{t("pages.qa.inbox.mute")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void remove(it.id)}><Trash2 className="mr-2 h-4 w-4" />{t("pages.qa.inbox.delete")}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {needsCrisisHelp(it.body) && <QaCrisisHelp audience="recipient" className="dark mt-3" />}
              {it.answer && !isReplying && (
                <p className="mt-3 whitespace-pre-line break-words rounded-xl bg-muted px-3 py-2 text-sm">{it.answer}</p>
              )}
              {isReplying ? (
                <div className="mt-3 space-y-2">
                  <textarea
                    autoFocus
                    value={drafts[it.id] ?? it.answer ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [it.id]: e.target.value.slice(0, ANSWER_MAX) }))}
                    rows={3}
                    placeholder={t("pages.qa.inbox.answerPlaceholder")}
                    aria-label={t("pages.qa.inbox.answer")}
                    className="w-full select-text resize-none rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => void publish(it.id)} className="gap-1.5"><Send className="h-3.5 w-3.5" />{it.published ? t("pages.qa.inbox.update") : t("pages.qa.inbox.publish")}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setReplying(null)}>{t("pages.qa.inbox.cancel")}</Button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant={it.answer ? "outline" : "default"} className="gap-1.5" onClick={() => setReplying(it.id)}>
                    <MessageCircleReply className="h-3.5 w-3.5" />{it.answer ? t("pages.qa.inbox.update") : t("pages.qa.inbox.answer")}
                  </Button>
                  {it.answer && owner && (
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShare({ space: it.space, target: { kind: "answer", question: it.body, answer: it.answer ?? "" } })}>
                      <Share2 className="h-3.5 w-3.5" />{t("pages.qa.inbox.share")}
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {scroll && hasNextPage && (
          <li ref={sentinel} className="col-span-full flex justify-center py-3 text-xs text-muted-foreground" aria-live="polite">
            {isFetchingNextPage && <span className="inline-flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />{t("pages.qa.inbox.loadingMore")}</span>}
          </li>
        )}
      </ul>

      <AlertDialog open={muteId !== null} onOpenChange={(v) => !v && setMuteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("pages.qa.inbox.muteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("pages.qa.inbox.muteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("pages.qa.inbox.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmMute()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("pages.qa.inbox.muteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {shareOwner && (
        <QaShareDialog
          open={share !== null}
          onOpenChange={(v) => !v && setShare(null)}
          target={share?.target ?? null}
          handle={shareOwner.handle}
          space={share!.space}
          displayName={shareOwner.displayName}
          avatarUrl={shareOwner.avatarUrl}
        />
      )}
    </div>
  );
}
