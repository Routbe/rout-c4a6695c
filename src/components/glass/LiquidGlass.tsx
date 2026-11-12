/**
 * Liquid Glass runtime for glass surfaces made by `glassSurfaceStyle`.
 *
 * - `LiquidGlassFilters` renders the SVG lens filters (rim refraction with a
 *   per-channel RGB split = chromatic aberration), one per quantised setting.
 * - `useLiquidGlassRuntime` flags engines that render SVG backdrop filters
 *   (Chromium desktop/Android) and feeds the pointer position to each glass
 *   surface so its specular sheen tracks the cursor/finger.
 * Other browsers keep the plain blur + saturate recipe.
 */
import { useEffect } from "react";
import { liquidFilterId, type GlassTokens } from "@/lib/theme-engine";

type LensTokens = Pick<GlassTokens, "glassStyle" | "glassRefraction" | "glassAberration">;

/** Edge-normal displacement map: neutral (0.5) in the middle, ramps at the rim. */
const MAP = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">` +
    `<defs><linearGradient id="x"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#f00"/></linearGradient>` +
    `<linearGradient id="y" x2="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#0f0"/></linearGradient>` +
    `<filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter></defs>` +
    `<rect width="100" height="100" fill="#000"/><rect width="100" height="100" fill="url(#x)"/>` +
    `<rect width="100" height="100" fill="url(#y)" style="mix-blend-mode:screen"/>` +
    `<rect x="16" y="16" width="68" height="68" rx="20" fill="rgb(128,128,0)" filter="url(#b)"/></svg>`,
)}`;

function LensFilter({ id, refraction, aberration }: { id: string; refraction: number; aberration: number }) {
  // Fractions of the surface box (primitiveUnits = objectBoundingBox).
  const base = refraction * 0.0011;
  const split = aberration * 0.00045;
  const channel = (key: string, scale: number, row: string) => (
    <>
      <feDisplacementMap in="SourceGraphic" in2="map" scale={scale} xChannelSelector="R" yChannelSelector="G" result={`${key}d`} />
      <feColorMatrix in={`${key}d`} type="matrix" values={row} result={key} />
    </>
  );
  return (
    <filter id={id} x="0" y="0" width="1" height="1" filterUnits="objectBoundingBox" primitiveUnits="objectBoundingBox" colorInterpolationFilters="sRGB">
      <feImage href={MAP} x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="map" />
      {channel("r", base + split, "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0")}
      {channel("g", base, "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0")}
      {channel("b", Math.max(0, base - split), "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0")}
      <feBlend in="r" in2="g" mode="screen" result="rg" />
      <feBlend in="rg" in2="b" mode="screen" />
    </filter>
  );
}

export function LiquidGlassFilters({ tokens }: { tokens: readonly LensTokens[] }) {
  const seen = new Map<string, { refraction: number; aberration: number }>();
  for (const t of tokens) {
    if (t.glassStyle === "solid") continue;
    const id = liquidFilterId(t);
    if (!id || seen.has(id)) continue;
    seen.set(id, { refraction: Math.round(t.glassRefraction / 5) * 5, aberration: Math.round(t.glassAberration / 5) * 5 });
  }
  if (!seen.size) return null;
  return (
    <svg aria-hidden width="0" height="0" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
      <defs>{[...seen].map(([id, v]) => <LensFilter key={id} id={id} {...v} />)}</defs>
    </svg>
  );
}

let installed = 0;
let disposeRuntime: (() => void) | null = null;
const SURFACE = '[style*="--lg-filter"], [style*="--lg-x"], [data-liquid-glass], .acrylic-card, .spatial-glass, .spatial-control-pill, .glow-card, .spatial-button, .spatial-input, .spatial-track, .spatial-switch, [role="tab"], [data-hardware-ui] button, [data-hardware-ui] input, [data-hardware-ui] textarea, [data-hardware-ui] [class~="bg-card"][class~="border"]';

function supportsSvgBackdrop(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } };
  const chromium = nav.userAgentData?.brands?.some((b) => b.brand === "Chromium") ?? false;
  return chromium && CSS.supports("backdrop-filter", "url(#a) blur(1px)");
}

export function useLiquidGlassRuntime() {
  useEffect(() => {
    installed += 1;
    const release = () => {
      installed -= 1;
      if (installed === 0) { disposeRuntime?.(); disposeRuntime = null; }
    };
    if (installed > 1) return release;
    const root = document.documentElement;
    if (supportsSvgBackdrop()) root.dataset["liquid"] = "1";
    let frame = 0;
    let last: PointerEvent | null = null;
    let surfaces: HTMLElement[] = [];
    let stale = true;
    const observer = new MutationObserver(() => { stale = true; });
    observer.observe(document.body, { childList: true, subtree: true });
    const apply = () => {
      frame = 0;
      const e = last;
      if (!e) return;
      if (stale) { surfaces = [...document.querySelectorAll<HTMLElement>(SURFACE)]; stale = false; }
      // Read layout once per surface before writing any styles; no React updates.
      const active = surfaces.map((el) => ({ el, r: el.getBoundingClientRect() })).filter(({ r }) =>
        r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight &&
        e.clientX >= r.left - 180 && e.clientX <= r.right + 180 && e.clientY >= r.top - 180 && e.clientY <= r.bottom + 180);
      for (const { el, r } of active) {
        const x = e.clientX - r.left, y = e.clientY - r.top;
        for (const name of ["--mouse-x", "--x", "--mx"]) el.style.setProperty(name, `${x.toFixed(1)}px`);
        for (const name of ["--mouse-y", "--y", "--my"]) el.style.setProperty(name, `${y.toFixed(1)}px`);
        el.style.setProperty("--lg-x", `${((x / r.width) * 100).toFixed(1)}%`);
        el.style.setProperty("--lg-y", `${((y / r.height) * 100 - 60).toFixed(1)}%`);
      }
    };
    const onMove = (e: PointerEvent) => {
      last = e;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    disposeRuntime = () => {
      window.removeEventListener("pointermove", onMove);
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      delete root.dataset["liquid"];
    };
    return release;
  }, []);
}
