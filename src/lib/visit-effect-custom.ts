/**
 * Eigen "Pagina bezoek effect": tot 4 emoji's met duur, hoeveelheid,
 * op-/afbouw, richting en wat er onderaan gebeurt. Alleen DOM + Web Animations.
 */
import { prefersReducedMotion } from "./visit-effects";

export const VISIT_DIRECTIONS = ["down", "up", "diagonal", "burst"] as const;
export const VISIT_RAMPS = ["soft", "fast", "instant"] as const;
export const VISIT_FLOORS = ["through", "vanish", "bounce", "splat"] as const;
export type VisitDirection = (typeof VISIT_DIRECTIONS)[number];
export type VisitRamp = (typeof VISIT_RAMPS)[number];
export type VisitFloor = (typeof VISIT_FLOORS)[number];

export interface VisitEffectCustom {
  enabled: boolean;
  emojis: string[];
  /** Totale duur in seconden (1–10). */
  duration: number;
  /** Aantal deeltjes (5–80). */
  amount: number;
  rampIn: VisitRamp;
  rampOut: VisitRamp;
  direction: VisitDirection;
  /** Vervaagt naarmate het verder beweegt. */
  fade: boolean;
  /** Gedrag onderaan als `fade` uit staat. */
  floor: VisitFloor;
}

export const DEFAULT_VISIT_CUSTOM: VisitEffectCustom = {
  enabled: false,
  emojis: ["✨"],
  duration: 4,
  amount: 30,
  rampIn: "soft",
  rampOut: "soft",
  direction: "down",
  fade: true,
  floor: "through",
};

export const MAX_VISIT_EMOJIS = 4;

const clamp = (n: unknown, min: number, max: number, fallback: number) => {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
};
const oneOf = <T extends string>(v: unknown, list: readonly T[], fb: T): T =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : fb;

/** Splitst tekst in afzonderlijke emoji/grafemen. */
export function splitGraphemes(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) return Array.from(new Seg(undefined, { granularity: "grapheme" }).segment(text), (s) => s.segment);
  return Array.from(text);
}

export function normalizeVisitCustom(raw: unknown): VisitEffectCustom {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const emojis = (Array.isArray(r.emojis) ? r.emojis : [])
    .filter((e): e is string => typeof e === "string")
    .map((e) => splitGraphemes(e.trim())[0] ?? "")
    .filter((e) => e.length > 0 && e.length <= 16 && !/[\p{L}\p{N}<>]/u.test(e))
    .slice(0, MAX_VISIT_EMOJIS);
  return {
    enabled: r.enabled === true,
    emojis: emojis.length ? emojis : [...DEFAULT_VISIT_CUSTOM.emojis],
    duration: clamp(r.duration, 1, 10, DEFAULT_VISIT_CUSTOM.duration),
    amount: clamp(r.amount, 5, 80, DEFAULT_VISIT_CUSTOM.amount),
    rampIn: oneOf(r.rampIn, VISIT_RAMPS, "soft"),
    rampOut: oneOf(r.rampOut, VISIT_RAMPS, "soft"),
    direction: oneOf(r.direction, VISIT_DIRECTIONS, "down"),
    fade: r.fade !== false,
    floor: oneOf(r.floor, VISIT_FLOORS, "through"),
  };
}

const rampMs = (r: VisitRamp, total: number) => (r === "instant" ? 0 : r === "fast" ? total * 0.12 : total * 0.35);

type P = { x: number; y: number; vx: number; vy: number; size: number; rot: number; vr: number; e: string; born: number; alpha: number; landedAt: number; scaleY: number; dead: boolean };

/**
 * Canvas-engine: één <canvas> overlay en één requestAnimationFrame-lus.
 * Geen DOM-node per deeltje, dus vlot op gsm, ook bij 200 deeltjes.
 */
function runCanvasVisitEffect(
  cfg: VisitEffectCustom,
  options?: { force?: boolean; container?: HTMLElement | null },
): () => void {
  if (typeof document === "undefined") return () => {};
  if (!options?.force && prefersReducedMotion()) return () => {};
  const c = normalizeVisitCustom(cfg);
  const container = options?.container ?? null;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = container
    ? "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:60"
    : "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:60";
  if (container && getComputedStyle(container).position === "static") container.style.position = "relative";
  (container ?? document.body).appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) { canvas.remove(); return () => {}; }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const box = container?.getBoundingClientRect();
  const W = box?.width || window.innerWidth;
  const H = box?.height || window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.scale(dpr, dpr);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Bodem boven de veilige zone onderaan (env(safe-area-inset-bottom)).
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;bottom:0;height:env(safe-area-inset-bottom,0px);visibility:hidden";
  document.body.appendChild(probe);
  const safe = container ? 0 : probe.getBoundingClientRect().height;
  probe.remove();

  const total = c.duration * 1000;
  const inMs = rampMs(c.rampIn, total);
  const outMs = rampMs(c.rampOut, total);
  const r = (a: number, b: number) => a + Math.random() * (b - a);
  const G = c.direction === "up" ? -0.00035 : c.direction === "burst" ? 0.0002 : 0.0006; // px/ms²
  const parts: P[] = [];
  let spawned = 0;
  let raf = 0;
  let done = false;
  const t0 = performance.now();
  let last = t0;

  const spawn = (now: number) => {
    const size = r(18, 34);
    const p: P = { x: r(0, W), y: -size, vx: r(-0.03, 0.03), vy: r(0.05, 0.2), size, rot: 0, vr: r(-0.004, 0.004), e: c.emojis[spawned % c.emojis.length] ?? "✨", born: now, alpha: 1, landedAt: 0, scaleY: 1, dead: false };
    if (c.direction === "up") { p.y = H + size; p.vy = r(-0.25, -0.1); }
    else if (c.direction === "diagonal") { p.x = r(-W * 0.3, W * 0.7); p.vx = r(0.12, 0.22); }
    else if (c.direction === "burst") { const a = r(0, Math.PI * 2), v = r(0.2, 0.6); p.x = W / 2; p.y = H / 2; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; }
    parts.push(p);
    spawned += 1;
  };

  const floorY = H - safe;
  const tick = (now: number) => {
    if (done) return;
    const dt = Math.min(48, now - last);
    last = now;
    const el = now - t0;
    // Opbouw: deeltjes gespreid over de opbouwtijd.
    const due = inMs === 0 ? c.amount : Math.min(c.amount, Math.ceil((el / inMs) * c.amount));
    while (spawned < due) spawn(now);
    // Afbouw: globale fade in de laatste fase.
    const outStart = total - outMs;
    const globalA = el < outStart || outMs === 0 ? 1 : Math.max(0, 1 - (el - outStart) / outMs);

    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const p of parts) {
      if (p.dead) continue;
      if (!p.landedAt) {
        p.vy += G * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
      }
      const bottom = floorY - p.size / 2;
      const falling = c.direction === "down" && !c.fade;
      if (falling && p.y >= bottom && !p.landedAt) {
        if (c.floor === "bounce") {
          p.y = bottom;
          p.vy *= -0.6;
          if (Math.abs(p.vy) < 0.05) { p.vy = 0; p.landedAt = now; }
        } else if (c.floor === "vanish" || c.floor === "splat") {
          p.y = bottom; p.vy = 0; p.vx = 0; p.landedAt = now;
        }
      }
      if (p.landedAt) {
        const since = now - p.landedAt;
        if (c.floor === "vanish") p.alpha = since < 1000 ? 1 : Math.max(0, 1 - (since - 1000) / 400);
        else if (c.floor === "splat") { p.scaleY = 0.2; p.alpha = Math.max(0, 1 - since / 300); }
        else if (c.floor === "bounce") p.alpha = Math.max(0, 1 - since / 500);
      } else if (c.fade) {
        // Vervaagt naarmate het verder beweegt.
        const prog = c.direction === "up" ? 1 - p.y / H : c.direction === "burst" ? Math.hypot(p.x - W / 2, p.y - H / 2) / (Math.max(W, H) / 2) : p.y / H;
        p.alpha = Math.max(0, 1 - Math.max(0, prog));
      }
      if (p.y > H + p.size || p.y < -p.size * 3 || p.x < -W * 0.5 || p.x > W * 1.5 || p.alpha <= 0) { p.dead = true; continue; }
      alive += 1;
      ctx.save();
      ctx.globalAlpha = p.alpha * globalA;
      ctx.translate(p.x, p.landedAt && c.floor === "splat" ? floorY - (p.size * 0.2) / 2 : p.y);
      ctx.rotate(p.landedAt ? 0 : p.rot);
      ctx.scale(p.scaleY < 1 ? 1.8 : 1, p.scaleY);
      ctx.font = `${p.size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.fillText(p.e, 0, 0);
      ctx.restore();
    }
    if ((spawned >= c.amount && alive === 0) || el > total + 1500) return cleanup();
    raf = requestAnimationFrame(tick);
  };
  const cleanup = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    canvas.remove();
  };
  raf = requestAnimationFrame(tick);
  return cleanup;
}

/**
 * Lui gestart: pas na een rustige main thread (requestIdleCallback + 300 ms) wordt de
 * GPU-module asynchroon geladen; WebGL, shaders en worker starten nooit tijdens hydratatie.
 */
export function runCustomVisitEffect(
  cfg: VisitEffectCustom,
  options?: { force?: boolean; container?: HTMLElement | null; immediate?: boolean },
): () => void {
  if (typeof document === "undefined") return () => {};
  if (!options?.force && prefersReducedMotion()) return () => {};
  const c = normalizeVisitCustom(cfg);
  const total = c.duration * 1000;
  let stop: (() => void) | null = null, cancelled = false;
  const start = async () => {
    if (cancelled) return;
    try {
      const { runGpuVisitEffect } = await import("./visit-fx/run-gpu");
      if (cancelled) return;
      stop = runGpuVisitEffect({
        emojis: c.emojis.length ? c.emojis : ["✨"], amount: c.amount, direction: c.direction, fade: c.fade,
        floorMode: c.floor, rampInMs: rampMs(c.rampIn, total), rampOutMs: rampMs(c.rampOut, total), totalMs: total,
      }, options?.container ?? null);
    } catch { stop = null; }
    if (!stop && !cancelled) stop = runCanvasVisitEffect(cfg, { ...options, force: true });
  };
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  let idle = 0, timer: ReturnType<typeof setTimeout> | null = null;
  if (options?.immediate) void start();
  else if (w.requestIdleCallback) idle = w.requestIdleCallback(() => { timer = setTimeout(start, 300); }, { timeout: 700 });
  else timer = setTimeout(start, 500);
  return () => {
    cancelled = true;
    if (idle && w.cancelIdleCallback) w.cancelIdleCallback(idle);
    if (timer) clearTimeout(timer);
    stop?.();
  };
}
