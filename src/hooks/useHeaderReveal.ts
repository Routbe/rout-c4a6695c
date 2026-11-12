import { useEffect, useState } from "react";

/**
 * Smart sticky header behaviour: hide once the user scrolls DOWN past
 * `threshold`, and reveal instantly on the smallest upward gesture. Near the
 * very top of the document the header is always visible.
 */
export function useHeaderReveal(threshold = 50): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        const delta = y - last;
        last = y;

        // Always show the header at the top edge of the document.
        if (y < 10) {
          setHidden(false);
          return;
        }
        // Reveal instantly on any upward movement, hide on downward scroll.
        if (delta < 0) setHidden(false);
        else if (delta > 0 && y > threshold) setHidden(true);
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [threshold]);

  return hidden;
}
