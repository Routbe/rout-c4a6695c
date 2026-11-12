import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageCircleQuestion, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { profileImageSrc } from "@/lib/image-proxy-rules";
import { qaPaths, type QaSpace } from "./useQaPublic";
import { Button } from "@/components/ui/button";
import { storyGesture } from "@/lib/qa/story-gestures";
import { ProceduralStoryBackground } from "./ProceduralStoryBackground";
import { activePresence, type PresenceStory } from "@/lib/presence";
import { galleryImageSrc } from "@/lib/image-proxy-rules";
import { storedPromptLabel } from "@/lib/qa/prompts";
import { QaAskForm } from "./QaAskForm";
import { PulseText } from "@/components/presence/PulseText";

const STORY_MS = 6500;

function relativeTime(iso: string, locale: string): string {
  // Clamp small clock skew so a fresh answer never reads "in a minute".
  const diff = Math.min(0, (Date.parse(iso) - Date.now()) / 1000);
  if (Math.abs(diff) < 30) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "minute");
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(diff) < 3600) return rtf.format(Math.round(diff / 60), "minute");
  return rtf.format(Math.round(diff / 3600), "hour");
}

/** Full-screen status viewer: tap right/left to move, hold to pause, Esc or ✕ to close. */
export function QaStoryViewer({ stories, handle, space, displayName, avatarUrl, onClose }: {
  stories: PresenceStory[];
  handle: string;
  space: QaSpace;
  displayName: string | null;
  avatarUrl: string | null;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const [index, setIndex] = useState(0);
  const [pausedRaw, setPaused] = useState(false);
  const [asking, setAsking] = useState(false);
  const paused = pausedRaw || asking;
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const suppressTap = useRef(false);
  const story = stories[index];
  useEffect(() => { if (!stories.length) onClose(); else if (index >= stories.length) setIndex(stories.length - 1); }, [stories.length,index,onClose]);
  const avatar = profileImageSrc(avatarUrl);
  const name = displayName || `@${handle}`;

  const next = useCallback(() => {
    if (index + 1 >= stories.length) onClose();
    else setIndex(index + 1);
  }, [index, stories.length, onClose]);
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    const timer=setInterval(()=>{if(!asking && story && activePresence([story],Date.now()).length===0) next();},1000);
    return()=>clearInterval(timer);
  },[story,next,asking]);

  useEffect(() => {
    const focused = document.activeElement;
    closeRef.current?.focus();
    return () => { if (focused instanceof HTMLElement && focused.isConnected) focused.focus(); };
  }, []);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (asking) { if (e.key === "Escape") setAsking(false); return; }
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "Tab") {
        const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href]') ?? []);
        const first = controls[0]; const last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; };
  }, [onClose, next, prev, asking]);

  if (!story) return null;
  const promptLabel = storedPromptLabel(story.prompt, t) ?? t("pages.qa.story.anonymous");

  return createPortal(
    <div
      role="dialog"
      ref={dialogRef}
      aria-modal="true"
      aria-label={t("pages.qa.story.open", { name })}
      className="fixed inset-0 z-[110] flex touch-none select-none flex-col overflow-hidden bg-story-viewport text-story-card"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      onPointerDown={(e) => { pointer.current = { x: e.clientX, y: e.clientY }; suppressTap.current = false; setPaused(true); }}
      onPointerUp={(e) => {
        setPaused(false);
        const start = pointer.current; pointer.current = null;
        if (!start) return;
        const action = storyGesture(e.clientX - start.x, e.clientY - start.y);
        suppressTap.current = action !== "tap";
        if (action === "close") onClose();
      }}
      onPointerCancel={() => { pointer.current = null; setPaused(false); suppressTap.current = true; }}
    >
      <ProceduralStoryBackground paused={paused} theme={story.theme} />
      <div className="relative mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-4 pt-3">
        <div className="flex gap-1" aria-hidden>
          {stories.map((s, i) => (
            <span key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-story-card/30">
              {i < index && <span className="block h-full w-full bg-story-card" />}
              {i === index && (
                <span
                  key={`${s.id}-${index}`}
                  className="qa-story-progress block h-full w-full bg-story-card"
                  data-paused={paused ? "true" : "false"}
                  style={{ ["--qa-story-ms" as string]: `${STORY_MS}ms` }}
                  onAnimationEnd={next}
                />
              )}
            </span>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-3">
          {avatar ? (
            <img src={avatar} alt="" className="h-9 w-9 rounded-full object-cover ring-2 ring-story-ring" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-story-card text-sm font-semibold text-story-ink">{name.replace(/^@/, "").slice(0, 1).toUpperCase()}</span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="text-xs opacity-70">{story.pending ? t("presence.local") : relativeTime(story.createdAt, locale)}</p>
          </div>
          <Button variant="ghost" size="icon"
            ref={closeRef}
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-story-card/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-story-card"
            aria-label={t("pages.qa.story.close")}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="relative flex flex-1 items-center justify-center py-6">
          <Button variant="ghost" type="button" className="absolute inset-y-0 left-0 h-full w-1/3 rounded-none hover:bg-transparent" onClick={() => { if (!suppressTap.current) prev(); }} aria-label={t("pages.qa.story.prev")} />
          <Button variant="ghost" type="button" className="absolute inset-y-0 right-0 h-full w-2/3 rounded-none hover:bg-transparent" onClick={() => { if (!suppressTap.current) next(); }} aria-label={t("pages.qa.story.next")} />
          {story.statusType === "micro_text" ? <article className={`pointer-events-none relative w-full ${story.bg && story.bg !== "none" ? "aspect-[9/16] max-h-full overflow-hidden rounded-[28px] shadow-2xl" : ""}`}><PulseText text={story.text ?? ""} bg={story.bg} font={story.font ?? (story.bg ? "classic" : "display")} align={story.align} sticker={story.sticker} /></article> : story.statusType === "omni_drop" ? <article className="relative z-10 w-full overflow-hidden rounded-lg bg-story-card text-story-ink">
            {galleryImageSrc(story.mediaUrl) && <img src={galleryImageSrc(story.mediaUrl) ?? undefined} alt="" className="aspect-square w-full object-cover"/>}
            <a href={story.targetUrl} target={story.targetUrl?.startsWith("/")?undefined:"_blank"} rel="noopener noreferrer" onPointerDown={e=>e.stopPropagation()} className="block px-6 py-5 text-xl font-semibold">{story.title}{story.badge&&<span className="mt-2 block text-sm">{story.badge}</span>}</a>
          </article> : <article key={story.id} className="pointer-events-none max-h-full w-full overflow-y-auto animate-in fade-in zoom-in-95 duration-300">
            <div className="overflow-hidden rounded-[28px] bg-story-card text-story-ink shadow-2xl">
              <div className="bg-gradient-to-br from-story-ring to-story-ring-2 px-6 pb-6 pt-5 text-story-card">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest opacity-85">
                  <MessageCircleQuestion className="h-3.5 w-3.5" aria-hidden /> {promptLabel ?? t("pages.qa.story.anonymous")}
                </p>
                <p className="mt-2 break-words font-display text-2xl leading-snug">{story.question}</p>
              </div>
              <p className="whitespace-pre-line break-words px-6 py-5 text-lg leading-relaxed">{story.answer}</p>
            </div>
          </article>}
        </div>

        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={() => setAsking(true)}
          className="relative z-10 mb-4 inline-flex min-h-12 items-center justify-center rounded-full bg-story-card px-5 text-sm font-semibold text-story-ink transition-transform active:scale-[0.98]"
        >
          {t("pages.qa.story.askToo")}
        </button>
      </div>
      {asking && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("pages.qa.story.askToo")}
          className="absolute inset-0 z-20 flex touch-auto select-text items-end justify-center bg-story-viewport/80 p-3 backdrop-blur-sm sm:items-center"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onPointerCancel={(e) => e.stopPropagation()}
          onClick={(e) => { if (e.target === e.currentTarget) setAsking(false); }}
        >
          <div className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-3xl bg-background p-4 text-foreground shadow-2xl animate-in slide-in-from-bottom-4 fade-in duration-200">
            <div className="mb-2 flex items-center justify-between gap-2">
              <a href={qaPaths(handle, space).ask} className="text-xs text-muted-foreground underline-offset-2 hover:underline">@{handle}</a>
              <Button variant="ghost" size="icon" type="button" onClick={() => setAsking(false)} aria-label={t("pages.qa.story.close")}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <QaAskForm handle={handle} space={space} headline={t("pages.qa.story.askToo")} size="hub" />
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
