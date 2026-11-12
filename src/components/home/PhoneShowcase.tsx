import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { listShowcaseHandles } from "@/lib/showcase.functions";

/** Real member profiles rendered live inside a phone frame; swipe left/right. */
export function PhoneShowcase({ lead = [] }: { lead?: string[] }) {
  const [handles, setHandles] = useState<string[]>(lead);
  const [idx, setIdx] = useState(0);
  const [origin, setOrigin] = useState("");
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    listShowcaseHandles()
      .then((h) => setHandles([...new Set([...lead, ...h])]))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = (i: number) => {
    const el = track.current;
    if (!el || !handles.length) return;
    const n = (i + handles.length) % handles.length;
    el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
  };
  const onScroll = () => {
    const el = track.current;
    if (el) setIdx(Math.round(el.scrollLeft / el.clientWidth));
  };

  if (!handles.length) return null;
  const current = handles[Math.min(idx, handles.length - 1)];

  return (
    <div className="mx-auto flex w-full max-w-[360px] flex-col items-center gap-4">
      <div className="relative w-full">
        <div className="relative mx-auto aspect-[9/19] w-full max-w-[320px] rounded-[2.8rem] border-[10px] border-foreground bg-foreground shadow-2xl">
          <div className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-foreground" />
          <div
            ref={track}
            onScroll={onScroll}
            className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden rounded-[2.1rem] bg-background [scrollbar-width:none]"
          >
            {handles.map((h, i) => (
              <div key={h} className="relative h-full w-full shrink-0 snap-center">
                {origin && Math.abs(i - idx) <= 1 ? (
                  <iframe
                    title={`rout.be/${h}`}
                    src={`${origin}/${h}`}
                    loading="lazy"
                    className="h-full w-full border-0"
                    sandbox="allow-scripts allow-same-origin allow-popups"
                  />
                ) : null}
              </div>
            ))}
          </div>
        </div>
        {handles.length > 1 && (
          <>
            <button aria-label="Vorige" onClick={() => go(idx - 1)} className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full border border-border bg-card p-2 shadow">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button aria-label="Volgende" onClick={() => go(idx + 1)} className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full border border-border bg-card p-2 shadow">
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
      <a href={`/${current}`} target="_blank" rel="noreferrer" className="font-mono text-xs text-muted-foreground hover:text-foreground">
        rout.be/{current}
      </a>
      {handles.length > 1 && (
        <div className="flex gap-1.5">
          {handles.map((h, i) => (
            <button key={h} aria-label={h} onClick={() => go(i)} className={`h-1.5 rounded-full transition-all ${i === idx ? "w-5 bg-foreground" : "w-1.5 bg-muted-foreground/40"}`} />
          ))}
        </div>
      )}
    </div>
  );
}
