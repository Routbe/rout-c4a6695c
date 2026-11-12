import { useEffect, useRef } from "react";
import { createProceduralCanvas } from "@/lib/qa/procedural-canvas";

export function ProceduralStoryBackground({ paused = false, theme = "aurora" }: { paused?: boolean; theme?: "aurora" | "glass" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const engine = createProceduralCanvas(canvas, theme);
    if (!engine) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0; let elapsed = 0; let previous = performance.now();
    const resize = () => {
      canvas.width = Math.min(1080, Math.round(canvas.clientWidth * Math.min(window.devicePixelRatio, 1.5)));
      canvas.height = Math.min(1920, Math.round(canvas.clientHeight * Math.min(window.devicePixelRatio, 1.5)));
      engine.draw(elapsed);
    };
    const tick = (time: number) => {
      if (!pausedRef.current) { elapsed += Math.min(0.1, (time - previous) / 1000); engine.draw(elapsed); }
      previous = time;
      if (!document.hidden && !reduce.matches) frame = requestAnimationFrame(tick);
    };
    const resume = () => {
      cancelAnimationFrame(frame); previous = performance.now();
      if (!document.hidden && !reduce.matches) frame = requestAnimationFrame(tick);
      else engine.draw(elapsed);
    };
    resize(); resume();
    window.addEventListener("resize", resize); document.addEventListener("visibilitychange", resume); reduce.addEventListener("change", resume);
    return () => {
      cancelAnimationFrame(frame); engine.dispose();
      window.removeEventListener("resize", resize); document.removeEventListener("visibilitychange", resume); reduce.removeEventListener("change", resume);
    };
  }, [theme]);
  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full opacity-60" />;
}