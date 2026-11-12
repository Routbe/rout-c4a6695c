import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, ArrowRight, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { IDLE_STATE, isRunning, tourReducer } from "@/lib/tour/machine";
import { TOURS, isTourId, looksLikeUrl, stepKey, tourForPath, type TourId } from "@/lib/tour/definitions";
import { placeTooltip, type Insets } from "@/lib/tour/placement";
import { TOUR_START_EVENT, markTourDone, readCompletedTours } from "@/lib/tour/progress";
import { completeFirstUseTour, getFirstUseTour } from "@/lib/first-use-tour.functions";

const DWELL_MS = 4000;
const PAD = 6;
type Rect = { top: number; left: number; width: number; height: number };

function findTarget(name: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`);
  for (const el of all) if (el.getClientRects().length && el.getBoundingClientRect().width > 0) return el;
  return null;
}

function readInsets(probe: HTMLElement | null): Insets {
  if (!probe) return { top: 0, right: 0, bottom: 0, left: 0 };
  const s = getComputedStyle(probe);
  return { top: parseFloat(s.paddingTop) || 0, right: parseFloat(s.paddingRight) || 0, bottom: parseFloat(s.paddingBottom) || 0, left: parseFloat(s.paddingLeft) || 0 };
}

const haptic = () => { try { navigator.vibrate?.([10, 30, 10]); } catch { /* unsupported */ } };

/**
 * Global tour layer, mounted once in __root. Drives the headless FSM from DOM
 * facts and renders spotlight + tooltip into a body portal. The scrim is a
 * pointer-events:none box-shadow, so the page stays fully usable underneath.
 */
export function TourHost() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const complete = useServerFn(completeFirstUseTour);
  const getSeen = useServerFn(getFirstUseTour);
  const [state, dispatch] = useReducer(tourReducer, IDLE_STATE);
  const [rect, setRect] = useState<Rect | null>(null);
  const [tipSize, setTipSize] = useState({ width: 340, height: 180 });
  const [prompt, setPrompt] = useState<TourId | null>(null);
  const [mounted, setMounted] = useState(false);
  const targetRef = useRef<HTMLElement | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const tour = state.tourId && isTourId(state.tourId) ? TOURS[state.tourId] : null;
  const step = tour?.steps[state.index] ?? null;

  useEffect(() => setMounted(true), []);

  const begin = useCallback((id: TourId) => {
    setPrompt(null);
    dispatch({ type: "RESET" });
    dispatch({ type: "START", tourId: id, total: TOURS[id].steps.length });
  }, []);

  // Global (re)trigger: Cmd+K, help buttons.
  useEffect(() => {
    const onStart = (e: Event) => {
      const id = (e as CustomEvent<{ id?: unknown }>).detail?.id;
      if (isTourId(id)) begin(id);
    };
    window.addEventListener(TOUR_START_EVENT, onStart);
    return () => window.removeEventListener(TOUR_START_EVENT, onStart);
  }, [begin]);

  // Leaving the tour's page aborts silently.
  useEffect(() => {
    if (tour && isRunning(state) && !pathname.startsWith(tour.path)) dispatch({ type: "NAVIGATED_AWAY" });
  }, [pathname, tour, state]);

  // Persist finished / skipped tours, locally and on the account.
  useEffect(() => {
    if ((state.status !== "COMPLETED" && state.status !== "ABORTED") || !state.tourId || !isTourId(state.tourId)) return;
    const id = state.tourId;
    markTourDone(id);
    if (user) void complete({ data: { area: id } }).catch(() => {});
    targetRef.current = null;
    setRect(null);
    dispatch({ type: "RESET" });
  }, [state.status, state.tourId, user, complete]);

  // AWAITING_ELEMENT: watch the DOM until the target shows up.
  useEffect(() => {
    if (state.status !== "AWAITING_ELEMENT" || !step) return;
    let done = false;
    const attempt = () => {
      if (done) return;
      const el = findTarget(step.target);
      if (!el) return;
      done = true;
      targetRef.current = el;
      if (step.activate && el.getAttribute("aria-selected") !== "true") el.click();
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      dispatch({ type: "ELEMENT_FOUND" });
    };
    attempt();
    if (done) return;
    const mo = new MutationObserver(attempt);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-tour", "class", "hidden"] });
    return () => { done = true; mo.disconnect(); };
  }, [state.status, state.index, step]);

  // Track geometry with rAF-batched reads; detect a removed node.
  useEffect(() => {
    if (state.status !== "MOUNTING_SPOTLIGHT" && state.status !== "LISTENING_FOR_EVENT") return;
    const el = targetRef.current;
    if (!el) { dispatch({ type: "ELEMENT_LOST" }); return; }
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (!el.isConnected || !el.getClientRects().length) { dispatch({ type: "ELEMENT_LOST" }); return; }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    if (state.status === "MOUNTING_SPOTLIGHT") dispatch({ type: "MOUNTED" });
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    const io = new IntersectionObserver(schedule);
    io.observe(el);
    const mo = new MutationObserver(() => { if (!el.isConnected) dispatch({ type: "ELEMENT_LOST" }); });
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      ro.disconnect(); io.disconnect(); mo.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [state.status]);

  const advance = useCallback(() => { haptic(); dispatch({ type: "ADVANCE" }); }, []);

  // LISTENING_FOR_EVENT: advance on the real user action.
  useEffect(() => {
    if (state.status !== "LISTENING_FOR_EVENT" || !step?.advanceOn) return;
    const el = targetRef.current;
    if (!el) return;
    const rule = step.advanceOn;
    if (rule.kind === "click") {
      const onClick = () => advance();
      el.addEventListener("click", onClick);
      return () => el.removeEventListener("click", onClick);
    }
    const onInput = (e: Event) => {
      const v = (e.target as HTMLInputElement | null)?.value ?? "";
      if (rule.valid === "url" ? looksLikeUrl(v) : v.trim().length > 0) advance();
    };
    el.addEventListener("input", onInput);
    return () => el.removeEventListener("input", onInput);
  }, [state.status, step, advance]);

  useEffect(() => {
    if (state.status !== "TRANSITIONING") return;
    const id = window.setTimeout(() => dispatch({ type: "TRANSITION_DONE" }), 0);
    return () => clearTimeout(id);
  }, [state.status, state.index]);

  // Esc always escapes.
  useEffect(() => {
    if (!isRunning(state)) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dispatch({ type: "SKIP" }); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  // Tooltip resizes with longer translations.
  useLayoutEffect(() => {
    const el = tipRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTipSize({ width: el.offsetWidth, height: el.offsetHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [state.status === "LISTENING_FOR_EVENT"]);

  // Dwell: after 4 s without interaction on an unseen tour page, offer the tour.
  useEffect(() => {
    setPrompt(null);
    if (!user || isRunning(state)) return;
    const id = tourForPath(pathname);
    if (!id || readCompletedTours().includes(id)) return;
    let cancelled = false;
    let timer = 0;
    const arm = () => { clearTimeout(timer); timer = window.setTimeout(() => { if (!cancelled) setPrompt(id); }, DWELL_MS); };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    void getSeen({ data: { area: id } }).then((r) => {
      if (cancelled) return;
      if (r.seen) { markTourDone(id); return; }
      arm();
      events.forEach((ev) => window.addEventListener(ev, arm, { passive: true }));
    }).catch(() => {});
    return () => {
      cancelled = true;
      clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, arm));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, user?.id, state.status === "IDLE"]);

  if (!mounted) return null;

  const showing = state.status === "LISTENING_FOR_EVENT" && rect && step && tour;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const insets = readInsets(probeRef.current);
  const width = Math.min(352, vw - insets.left - insets.right - 24);
  const pos = showing ? placeTooltip(
    { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 },
    { width, height: tipSize.height }, { width: vw, height: vh }, insets,
  ) : null;
  const last = tour ? state.index === tour.steps.length - 1 : false;

  return createPortal(
    <>
      <div ref={probeRef} aria-hidden className="pointer-events-none invisible fixed inset-0 pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]" />
      <AnimatePresence>
        {showing && (
          <motion.div
            key="spotlight"
            layoutId="rout-tour-spotlight"
            aria-hidden
            className="pointer-events-none fixed left-0 top-0 z-[70] select-none rounded-xl ring-2 ring-primary"
            style={{ willChange: "transform, opacity", boxShadow: "0 0 0 9999px hsl(var(--tour-scrim))" }}
            initial={{ opacity: 0, x: rect.left - PAD, y: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
            animate={{ opacity: 1, x: rect.left - PAD, y: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 38, mass: 0.6 }}
          />
        )}
        {showing && pos && (
          <motion.div
            key={`tip-${locale}`}
            ref={tipRef}
            role="dialog"
            aria-modal="false"
            aria-labelledby="rout-tour-title"
            aria-describedby="rout-tour-body"
            className="fixed left-0 top-0 z-[71] max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-24px)] select-none overflow-auto rounded-2xl border border-border bg-popover p-4 text-popover-foreground shadow-xl"
            style={{ width, willChange: "transform, opacity" }}
            initial={{ opacity: 0, x: pos.left, y: pos.top + 6 }}
            animate={{ opacity: 1, x: pos.left, y: pos.top }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground" aria-live="polite">
              {t("tourEngine.ui.step", { current: state.index + 1, total: tour.steps.length })}
            </p>
            <h3 id="rout-tour-title" className="mt-1 text-sm font-semibold">{t(stepKey(tour.id, step.id, "title"))}</h3>
            <p id="rout-tour-body" className="mt-2 text-sm text-muted-foreground">{t(stepKey(tour.id, step.id, "body"))}</p>
            {step.advanceOn && <p className="mt-2 text-xs text-primary">{t(step.advanceOn.kind === "click" ? "tourEngine.ui.waitClick" : "tourEngine.ui.waitInput")}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" className="mr-auto px-2 text-muted-foreground" onClick={() => dispatch({ type: "SKIP" })}>
                {t("tourEngine.ui.skip")} <kbd className="ml-1 hidden rounded border border-border px-1 font-mono text-[10px] sm:inline">Esc</kbd>
              </Button>
              <Button variant="ghost" size="icon" disabled={state.index === 0} aria-label={t("tourEngine.ui.back")} onClick={() => dispatch({ type: "BACK" })}><ArrowLeft /></Button>
              <Button variant="secondary" size="sm" onClick={advance}>{t(last ? "tourEngine.ui.done" : "tourEngine.ui.next")}<ArrowRight /></Button>
            </div>
          </motion.div>
        )}
        {prompt && !isRunning(state) && (
          <motion.div
            key="prompt"
            className="fixed bottom-[calc(env(safe-area-inset-bottom)+16px)] right-[calc(env(safe-area-inset-right)+16px)] z-[71] flex items-center gap-1 rounded-full border border-border bg-popover p-1 pl-3 text-sm text-popover-foreground shadow-lg"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
          >
            <span className="relative mr-1 flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-primary" /></span>
            <button type="button" className="flex items-center gap-1.5 rounded-full px-2 py-1 hover:bg-muted" onClick={() => begin(prompt)}>
              <Sparkles className="h-3.5 w-3.5" /> {t(`tourEngine.ui.start.${prompt}`)}
            </button>
            <button type="button" className="rounded-full p-1.5 text-muted-foreground hover:bg-muted" aria-label={t("tourEngine.ui.dismiss")} onClick={() => { markTourDone(prompt); setPrompt(null); }}>
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>,
    document.body,
  );
}
