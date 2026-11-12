import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

/** Single universal floating scroll-to-top button, rendered once in AppLayout. */
export function BackToTop() {
  const [visible, setVisible] = useState(false);
  const [nearFooter, setNearFooter] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Hide the puck once the footer enters the viewport, so it can never clip the
  // status line, navigation links or the copyright notice.
  useEffect(() => {
    const footer = document.querySelector("footer");
    if (!footer || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => setNearFooter(entries.some((e) => e.isIntersecting)),
      { rootMargin: "0px 0px -40px 0px", threshold: 0 },
    );
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  if (!visible || nearFooter) return null;

  return (
    <button
      type="button"
      aria-label="Scroll to top"
      data-testid="back-to-top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={cn(
        "fixed bottom-6 right-6 z-50",
        "flex h-11 w-11 items-center justify-center rounded-full",
        "border border-border/40 bg-foreground/80 shadow-lg backdrop-blur",
        "text-background transition-opacity hover:opacity-90",
      )}
    >
      <ArrowUp className="h-4 w-4" aria-hidden />
    </button>
  );
}
