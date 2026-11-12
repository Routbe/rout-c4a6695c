import { useEffect, useState, type RefObject } from "react";

type Box = { x: number; y: number; w: number; h: number; pad: string };

/** Designer easter egg: type "DEV" (or tap the toggle) for a Figma-style inspect view. */
export function useWireframeMode() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let buf = "";
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      buf = (buf + e.key.toUpperCase()).slice(-3);
      if (buf === "DEV") setOn((v) => !v);
      if (e.key === "Escape") setOn(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return [on, setOn] as const;
}

/** Labels with real size + padding for the main cards inside `root`. */
export function WireframeOverlay({ root }: { root: RefObject<HTMLElement | null> }) {
  const [boxes, setBoxes] = useState<Box[]>([]);
  useEffect(() => {
    const measure = () => {
      const el = root.current;
      if (!el) return;
      const base = el.getBoundingClientRect();
      const nodes = Array.from(el.querySelectorAll<HTMLElement>("section, form, a, button, h1, [class*='rounded-2xl']")).slice(0, 80);
      setBoxes(
        nodes
          .map((n) => {
            const r = n.getBoundingClientRect();
            const cs = getComputedStyle(n);
            const p = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map((v) => Math.round(parseFloat(v)));
            const pad = p.every((v) => v === p[0]) ? `p ${p[0]}` : `p ${p.join(" ")}`;
            return { x: r.left - base.left, y: r.top - base.top, w: Math.round(r.width), h: Math.round(r.height), pad };
          })
          .filter((b) => b.w > 40 && b.h > 16),
      );
    };
    measure();
    window.addEventListener("resize", measure);
    const id = window.setInterval(measure, 1500);
    return () => {
      window.removeEventListener("resize", measure);
      window.clearInterval(id);
    };
  }, [root]);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-40">
      {boxes.map((b, i) => (
        <span key={i} className="rout-wf-label" style={{ left: b.x, top: Math.max(0, b.y - 14) }}>
          {b.w}×{b.h} · {b.pad}
        </span>
      ))}
    </div>
  );
}
