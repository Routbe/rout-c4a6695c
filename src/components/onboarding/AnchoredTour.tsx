import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export type TourStep = { target: string; title: string; body: string; activate?: boolean };

/** Position guidance beside its live target, including after scrolling or resizing. */
export function AnchoredTour({ steps, onDone, labels }: {
  steps: TourStep[]; onDone: () => void;
  labels: { skip: string; back: string; next: string; done: string };
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(200);
  const step = steps[index];
  useEffect(() => {
    if (!step) return;
    let target: HTMLElement | null = null;
    const find = () => {
      const found = document.querySelector<HTMLElement>(step.target);
      if (!found || !found.getClientRects().length) { setRect(null); return; }
      if (found !== target) {
        target = found;
        if (step.activate && found.getAttribute("aria-selected") !== "true") found.click();
        found.scrollIntoView({ block: "center", behavior: "instant" });
      }
      setRect(found.getBoundingClientRect());
    };
    find();
    const timer = window.setInterval(find, 250);
    window.addEventListener("scroll", find, true);
    window.addEventListener("resize", find);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onDone(); };
    window.addEventListener("keydown", escape);
    return () => {
      clearInterval(timer);
      window.removeEventListener("scroll", find, true);
      window.removeEventListener("resize", find);
      window.removeEventListener("keydown", escape);
    };
  }, [step, onDone]);
  useEffect(() => {
    if (!panel.current) return;
    const observer = new ResizeObserver(entries => { const entry = entries[0]; if (entry) setHeight(entry.contentRect.height + 32); });
    observer.observe(panel.current);
    return () => observer.disconnect();
  }, []);
  if (!step || typeof document === "undefined") return null;
  const width = Math.min(352, window.innerWidth - 24);
  const below = rect ? rect.bottom + height + 16 <= window.innerHeight : true;
  const top = rect ? Math.max(12, Math.min(window.innerHeight - height - 12, below ? rect.bottom + 12 : rect.top - height - 12)) : 12;
  const left = rect ? Math.max(12, Math.min(window.innerWidth - width - 12, rect.left)) : 12;
  return createPortal(<>
    {rect && <div aria-hidden className="pointer-events-none fixed z-[59] rounded-md ring-2 ring-ring ring-offset-2 ring-offset-background" style={{ left: rect.left - 3, top: rect.top - 3, width: rect.width + 6, height: rect.height + 6 }} />}
    <div ref={panel} role="dialog" aria-modal="false" aria-labelledby="guided-tour-title" aria-describedby="guided-tour-body" className="fixed z-[60] max-h-[calc(100dvh-24px)] overflow-auto rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-md" style={{ left, top, width }}>
      <p className="text-xs text-muted-foreground" aria-live="polite">{index + 1} / {steps.length}</p>
      <h3 id="guided-tour-title" className="mt-1 text-sm font-semibold">{step.title}</h3>
      <p id="guided-tour-body" className="mt-2 text-sm text-muted-foreground">{step.body}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="mr-auto" onClick={onDone}>{labels.skip}</Button>
        <Button variant="ghost" size="icon" disabled={index === 0} aria-label={labels.back} onClick={() => setIndex(i => i - 1)}><ArrowLeft /></Button>
        <Button variant="secondary" size="sm" onClick={() => index === steps.length - 1 ? onDone() : setIndex(i => i + 1)}>{index === steps.length - 1 ? labels.done : labels.next}<ArrowRight /></Button>
      </div>
    </div>
  </>, document.body);
}