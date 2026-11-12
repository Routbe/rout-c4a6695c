import type { Body, FrameMsg, WorkerMsg } from "./protocol";
import { createGlRenderer } from "./gl-renderer";

export type GpuRunConfig = Omit<Extract<WorkerMsg, { type: "init" }>, "type" | "width" | "height" | "floor" | "bodies" | "textures"> & { emojis: string[] };

const COLLIDERS = "[data-visit-collider], img, a, button, [data-block-id]";

/** Leest de statische lichamen (avatar, knoppen, kaarten) relatief t.o.v. de overlay. */
export function readBodies(root: ParentNode, origin: DOMRect, w: number, h: number): Body[] {
  const out: Body[] = [];
  root.querySelectorAll<HTMLElement>(COLLIDERS).forEach((el) => {
    if (el.closest("[data-visit-fx]")) return;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 24 || r.width > w * 0.98) return;
    const x = r.left - origin.left, y = r.top - origin.top;
    if (y + r.height < 0 || y > h) return; // h = paginahoogte
    out.push([x, y, r.width, r.height]);
  });
  return out.slice(0, 64);
}

/** GPU + worker pad. Geeft null terug als WebGL of workers ontbreken (caller valt terug op canvas 2D). */
export function runGpuVisitEffect(cfg: GpuRunConfig, container: HTMLElement | null): (() => void) | null {
  if (typeof Worker === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.dataset.visitFx = "";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = container
    ? "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:50"
    : "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:50";
  const host = container ?? document.body;
  if (container && getComputedStyle(container).position === "static") container.style.position = "relative";
  host.appendChild(canvas);
  const renderer = createGlRenderer(canvas, cfg.emojis);
  if (!renderer) { canvas.remove(); return null; }

  let done = false, latest: Float32Array | null = null, count = 0, raf = 0, safe = 0;
  // Render-thread camera: de worker leeft in een absolute wereld; scrollY wordt elke rAF
  // gelezen en als translatie in de WebGL-vertexshader toegepast. Nooit naar de worker.
  const camY = () => (container ? 0 : window.scrollY);
  let g = { w: 0, h: 0, floor: 0, page: 0, bodies: [] as Body[] };
  // Eén gebatchte layout-read; resultaat wordt gecachet tot de lay-out echt verandert.
  const measure = () => {
    const vr = container ? container.getBoundingClientRect() : new DOMRect(0, -window.scrollY, window.innerWidth, window.innerHeight);
    const w = container ? vr.width : window.innerWidth;
    const h = container ? Math.min(vr.height, window.innerHeight) : window.innerHeight;
    const page = container ? h : document.documentElement.scrollHeight;
    g = { w, h, floor: container ? h : page - safe, page, bodies: readBodies(container ?? document, vr, w, page) };
  };
  const worker = new Worker(new URL("./physics.worker.ts", import.meta.url), { type: "module" });
  const t0 = performance.now();
  const post = (m: WorkerMsg) => worker.postMessage(m);
  let relayout: ReturnType<typeof setTimeout> | null = null;
  const onLayout = () => {
    if (relayout) clearTimeout(relayout);
    relayout = setTimeout(() => requestAnimationFrame(() => {
      if (done) return; measure(); post({ type: "bodies", bodies: g.bodies, width: g.w, height: g.h, floor: g.floor, pageHeight: g.page });
    }), 150);
  };
  const ro = new ResizeObserver(onLayout);
  const cleanup = () => {
    if (done) return; done = true;
    post({ type: "stop" }); worker.terminate(); cancelAnimationFrame(raf);
    if (relayout) clearTimeout(relayout);
    ro.disconnect();
    renderer.dispose(); canvas.remove();
  };
  worker.onmessage = (e: MessageEvent<FrameMsg>) => {
    if (e.data.type === "done") return cleanup();
    latest = e.data.data; count = e.data.count;
  };
  worker.onerror = cleanup;
  const frame = (now: number) => {
    if (done) return;
    if (latest) renderer.draw(latest, count, g.w, g.h, now - t0, camY());
    raf = requestAnimationFrame(frame);
  };
  requestAnimationFrame(() => {
    if (done) return;
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;bottom:0;height:env(safe-area-inset-bottom,0px);visibility:hidden";
    document.body.appendChild(probe);
    safe = container ? 0 : probe.getBoundingClientRect().height;
    probe.remove();
    measure();
    ro.observe(container ?? document.documentElement);
    (container ?? document).querySelectorAll<HTMLElement>("[data-visit-collider], [data-block-id]").forEach((el) => ro.observe(el));
    const { emojis, ...rest } = cfg;
    post({ type: "init", ...rest, textures: emojis.length, width: g.w, height: g.h, floor: g.floor, bodies: g.bodies, cameraY: camY(), pageHeight: g.page });
    raf = requestAnimationFrame(frame);
  });
  return cleanup;
}
