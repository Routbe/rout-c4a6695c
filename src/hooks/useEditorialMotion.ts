import { useEffect, useRef } from "react";

/** Anime owns only decorative transforms; text is always present before hydration. */
export function useEditorialMotion<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let disposed = false;
    let cleanup = () => {};
    void import("animejs").then(({ animate, stagger }) => {
      if (disposed) return;
      const intro = animate(host.querySelectorAll("[data-intro]"), {
        y: [18, 0], opacity: [0.35, 1], duration: 800,
        delay: stagger(65), ease: "out(3)",
      });
      const animations: ReturnType<typeof animate>[] = [intro];
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          animations.push(animate(entry.target, { y: [24, 0], opacity: [0.55, 1], duration: 750, ease: "out(3)" }));
          observer.unobserve(entry.target);
        }
      }, { threshold: 0.08 });
      host.querySelectorAll("[data-editorial-reveal]").forEach((el) => observer.observe(el));
      cleanup = () => { observer.disconnect(); animations.forEach((animation) => animation.revert()); };
    });
    return () => { disposed = true; cleanup(); };
  }, []);
  return ref;
}