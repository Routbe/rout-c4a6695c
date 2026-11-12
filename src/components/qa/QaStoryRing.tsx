import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { activeStories, seenStorageKey } from "@/lib/qa/story";
import { useQaPublic, type QaSpace } from "./useQaPublic";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { getPublicPresence } from "@/lib/ephemeral.functions";
import { activePresence, presenceKey, type PresenceStory, type StatusInput } from "@/lib/presence";
import { useAuth } from "@/hooks/useAuth";
import { pendingStatuses } from "@/lib/presence-local";

const QaStoryViewer = lazy(() => import("./QaStoryViewer").then((m) => ({ default: m.QaStoryViewer })));

/**
 * Status ring around the avatar (WhatsApp / Instagram style): green while a
 * visitor has unseen answers from the last 24 hours, grey once watched. Tapping
 * opens the answers as full-screen stories. Without stories it renders the
 * avatar untouched.
 */
export function QaStoryRing({ handle, space, displayName, avatarUrl, children, enabled = true, shapeClassName = "rounded-full", shapeStyle }: {
  /** Live Presence → "Toon Pulse-ring om avatar". Off renders the avatar untouched. */
  enabled?: boolean;
  /** Matches the avatar shape so the ring never crops a square/rounded avatar into a circle. */
  shapeClassName?: string;
  shapeStyle?: Record<string, string>;
  handle: string | null;
  space: QaSpace;
  displayName: string | null;
  avatarUrl: string | null;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const {user}=useAuth();
  const pendingScope=JSON.stringify([user?.id,handle?.toLowerCase(),space]);
  const [pendingState,setPendingState]=useState<{scope:string;rows:PresenceStory[]}>({scope:'',rows:[]});
  const pending=pendingState.scope===pendingScope?pendingState.rows:[];
  const qa = useQaPublic(handle, space);
  const presence = useQuery({ queryKey: presenceKey(space,handle ?? ""),queryFn:()=>getPublicPresence({data:{handle:handle ?? "",space}}).then(r=>r.stories),enabled:Boolean(handle),staleTime:60_000 });
  const [now, setNow] = useState<number | null>(null);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const stories = useMemo(() => {
    if(now===null)return [];
    if(presence.data)return activePresence([...presence.data,...pending.filter(p=>!presence.data.some(s=>s.id===p.id))],now);
    return activePresence([...activeStories(qa.data?.answers ?? [],now).map(s=>({id:s.id,statusType:"qa_reply" as const,question:s.body,answer:s.answer,prompt:s.prompt,createdAt:s.answeredAt,expiresAt:s.storyUntil ?? new Date(Date.parse(s.answeredAt)+86400000).toISOString()})),...pending],now);
  }, [qa.data,presence.data,now,pending]);

  useEffect(()=>{
    let alive=true;setPendingState({scope:pendingScope,rows:[]});if(!user || !handle)return;
    const add=(input:StatusInput,createdAt:string)=>{if(input.space!==space||input.statusType!=="micro_text")return;
      setPendingState(state=>({scope:pendingScope,rows:[...(state.scope===pendingScope?state.rows:[]).filter(r=>r.id!==input.id),{id:input.id,statusType:"micro_text",...input.payload,createdAt,expiresAt:new Date(Date.parse(createdAt)+86400000).toISOString(),pending:true}]}));};
    void pendingStatuses(user.id).then(rows=>{if(alive)rows.filter(r=>r.handle.toLowerCase()===handle.toLowerCase()).forEach(r=>add(r.input,r.createdAt));}).catch(()=>undefined);
    const onPending=(e:Event)=>{const d=(e as CustomEvent<{owner:string;handle:string;input:StatusInput}>).detail;if(d.owner===user.id && d.handle===handle)add(d.input,new Date().toISOString());};
    const onConfirmed=(e:Event)=>{const d=(e as CustomEvent<{owner:string;handle:string;space:string;id:string}>).detail;if(d.owner===user.id&&d.handle===handle&&d.space===space)setPendingState(state=>({...state,rows:state.rows.filter(r=>r.id!==d.id)}));};
    window.addEventListener("rout-presence-pending",onPending);window.addEventListener("rout-presence-confirmed",onConfirmed);
    return()=>{alive=false;window.removeEventListener("rout-presence-pending",onPending);window.removeEventListener("rout-presence-confirmed",onConfirmed);};
  },[user?.id,handle,space,pendingScope]);

  // Browser-only state after hydration: current time and what this visitor watched.
  useEffect(() => {
    setNow(Date.now());
    setSeenAt(null);
    setOpen(false);
    if (!handle) return;
    try { setSeenAt(window.localStorage.getItem(seenStorageKey(space, handle))); } catch { /* storage blocked */ }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const refresh = () => setNow(Date.now());
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [handle, space]);

  const close = useCallback(() => {
    setOpen(false);
    const latest = stories[stories.length - 1]?.createdAt ?? null;
    if (!latest || !handle) return;
    setSeenAt(latest);
    try { window.localStorage.setItem(seenStorageKey(space, handle), latest); } catch { /* storage blocked */ }
  }, [stories, handle, space]);

  if (!enabled || !handle || stories.length === 0) return <>{children}</>;
  const unseen = !seenAt || stories.some(s=>Date.parse(s.createdAt)>Date.parse(seenAt));
  const name = displayName || `@${handle}`;

  return (
    <>
      <Button variant="ghost"
        type="button"
        onClick={() => setOpen(true)}
        className={`qa-story-ring relative inline-flex h-auto ${shapeClassName} p-[3px] transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`}
        style={shapeStyle}
        data-seen={unseen ? "false" : "true"}
        aria-label={t("pages.qa.story.open", { name })}
        aria-haspopup="dialog"
      >
        <span className={`inline-flex ${shapeClassName} bg-background p-[3px]`} style={shapeStyle}>{children}</span>
      </Button>
      {open && (
        <Suspense fallback={null}>
          <QaStoryViewer stories={stories} handle={handle} space={space} displayName={displayName} avatarUrl={avatarUrl} onClose={close} />
        </Suspense>
      )}
    </>
  );
}
