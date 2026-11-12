import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { getConsoleTourSeen, markConsoleTourSeen } from "@/lib/console-tour.functions";

const steps = ["workspace", "apps", "api", "docs", "settings"] as const;

/** Non-modal hints leave the highlighted controls usable. */
export function ConsoleTour() {
  const { t } = useI18n();
  const { user } = useAuth();
  const getSeen = useServerFn(getConsoleTourSeen);
  const markSeen = useServerFn(markConsoleTourSeen);
  const [step, setStep] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const restart = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const manuallyStarted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    if (user?.id) void getSeen().then((seen) => {
      if (!cancelled && !seen && !manuallyStarted.current) setStep(0);
    }).catch(() => { /* A preferences outage must not block the console. */ });
    return () => { cancelled = true; };
  }, [user?.id, getSeen]);

  const finish = () => {
    setStep(null);
    void markSeen().catch(() => {});
    restart.current?.focus();
  };

  useEffect(() => {
    if (step === null) return;
    const update = () => {
      const targets = [...document.querySelectorAll<HTMLElement>(`[data-tour="${steps[step]}"]`)];
      const target = targets.find((el) => el.getBoundingClientRect().width > 0);
      setRect(target?.getBoundingClientRect() ?? null);
    };
    update();
    card.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); finish(); }
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("keydown", keydown);
    const observer = new ResizeObserver(update);
    observer.observe(document.body);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("keydown", keydown);
      observer.disconnect();
    };
  }, [step]);

  const width = Math.min(340, typeof window === "undefined" ? 340 : window.innerWidth - 32);
  const left = rect ? Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)) : undefined;
  const top = rect ? Math.max(16, Math.min(rect.bottom + 12, window.innerHeight - 240)) : undefined;
  return <>
    <button ref={restart} type="button" className="rounded-md border border-border px-2 py-1.5 text-xs hover:bg-muted" onClick={() => { manuallyStarted.current = true; setStep(0); }}>{t("consoleTour.restart")}</button>
    {step !== null && <div className="pointer-events-none fixed inset-0 z-[60]">
      {rect && <div className="absolute rounded-lg border-2 border-primary ring-4 ring-primary/20" style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }} />}
      <div ref={card} tabIndex={-1} role="dialog" aria-modal="false" aria-labelledby="console-tour-title" className={`pointer-events-auto absolute rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-xl ${rect ? "" : "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"}`} style={{ width, left, top }}>
        <p className="text-xs text-muted-foreground" aria-live="polite">{t("consoleTour.step")} {step + 1} / {steps.length}</p>
        <h2 id="console-tour-title" className="mt-2 font-semibold">{t(`consoleTour.${steps[step]}.title`)}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t(`consoleTour.${steps[step]}.body`)}</p>
        <div className="mt-4 flex items-center gap-2 text-sm">
          <button type="button" onClick={finish} className="mr-auto rounded px-2 py-1 hover:bg-muted">{t("consoleTour.skip")}</button>
          <button type="button" disabled={step === 0} onClick={() => setStep(step - 1)} className="rounded px-2 py-1 hover:bg-muted disabled:opacity-40">{t("consoleTour.back")}</button>
          <button type="button" onClick={() => step === steps.length - 1 ? finish() : setStep(step + 1)} className="rounded bg-primary px-3 py-1 text-primary-foreground">{t(step === steps.length - 1 ? "consoleTour.done" : "consoleTour.next")}</button>
        </div>
      </div>
    </div>}
  </>;
}
