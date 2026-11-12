import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface LegalChip {
  /** Target section id, without the leading hash. */
  id: string;
  label: string;
}

/**
 * Horizontal, touch-scrollable anchor chips for long legal documents.
 *
 * - real <a href="#id"> semantics (keyboard, middle-click, no-JS fallback)
 * - Enter and Space both activate and smooth-scroll to the section
 * - IntersectionObserver scroll spy highlights the section in view
 */
export function LegalChips({
  chips,
  className,
  label = "Jump to section",
}: {
  chips: LegalChip[];
  className?: string;
  label?: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const barRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const targets = chips
      .map((c) => document.getElementById(c.id))
      .filter((el): el is HTMLElement => !!el);
    if (!targets.length || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Prefer the entry closest to the top of the reading area.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -55% 0px", threshold: [0, 0.25, 1] },
    );

    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, [chips]);

  // Keep the active chip in view inside the scroller.
  useEffect(() => {
    if (!active || !barRef.current) return;
    const bar = barRef.current;
    const chip = bar.querySelector<HTMLElement>(`[data-chip="${active}"]`);
    if (!chip) return;
    // Scroll the chip bar horizontally only. scrollIntoView() would also move
    // the page vertically, fighting the scroll spy and locking the document.
    const left = chip.offsetLeft - (bar.clientWidth - chip.offsetWidth) / 2;
    bar.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [active]);

  const go = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(id);
  };

  return (
    <nav
      ref={barRef}
      aria-label={label}
      data-testid="legal-chips"
      className={cn(
        "no-print mb-6 -mx-4 flex gap-2 overflow-x-auto whitespace-nowrap px-4 py-2",
        "overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {chips.map((c) => {
        const isActive = active === c.id;
        return (
          <a
            key={c.id}
            data-chip={c.id}
            href={`#${c.id}`}
            aria-current={isActive ? "location" : undefined}
            onClick={(e) => {
              e.preventDefault();
              go(c.id);
            }}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Spacebar") {
                e.preventDefault();
                go(c.id);
              }
            }}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 font-mono text-[11px] transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              isActive
                ? "border-foreground bg-foreground text-background"
                : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {c.label}
          </a>
        );
      })}
    </nav>
  );
}
