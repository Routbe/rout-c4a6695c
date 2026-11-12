import { useEffect, useRef, type ReactNode } from "react";

/**
 * Endless strip moving right → left. Pauses on hover/focus, can be grabbed
 * and dragged (mouse or touch). A drag never triggers the child link click.
 * Children must be rendered twice by the caller-independent loop below.
 */
export function DragMarquee({ children, speed = 40 }: { children: ReactNode; speed?: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const state = useRef({ x: 0, hover: false, down: false, startX: 0, startOffset: 0, moved: 0 });

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const s = state.current;
      const el = track.current;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (el) {
        const half = el.scrollWidth / 2;
        if (!s.hover && !s.down && !reduce) s.x -= speed * dt;
        if (half > 0) {
          if (s.x <= -half) s.x += half;
          if (s.x > 0) s.x -= half;
        }
        el.style.transform = `translate3d(${s.x}px,0,0)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speed]);

  const s = state.current;
  return (
    <div
      ref={wrap}
      className="marquee-edge relative cursor-grab touch-pan-y select-none overflow-hidden py-2 active:cursor-grabbing"
      onPointerEnter={(e) => { if (e.pointerType === "mouse") s.hover = true; }}
      onPointerLeave={() => { s.hover = false; s.down = false; }}
      onFocusCapture={() => { s.hover = true; }}
      onBlurCapture={() => { s.hover = false; }}
      onPointerDown={(e) => {
        s.down = true; s.startX = e.clientX; s.startOffset = s.x; s.moved = 0;
      }}
      onPointerMove={(e) => {
        if (!s.down) return;
        const d = e.clientX - s.startX;
        s.moved = Math.max(s.moved, Math.abs(d));
        s.x = s.startOffset + d;
        if (s.moved > 5 && !wrap.current?.hasPointerCapture(e.pointerId)) {
          wrap.current?.setPointerCapture(e.pointerId);
        }
      }}
      onPointerUp={() => { s.down = false; }}
      onPointerCancel={() => { s.down = false; }}
      onClickCapture={(e) => { if (s.moved > 5) { e.preventDefault(); e.stopPropagation(); s.moved = 0; } }}
      onDragStart={(e) => e.preventDefault()}
    >
      <div ref={track} className="flex w-max gap-3 will-change-transform">
        <div className="flex gap-3">{children}</div>
        <div className="flex gap-3" aria-hidden>{children}</div>
      </div>
    </div>
  );
}
