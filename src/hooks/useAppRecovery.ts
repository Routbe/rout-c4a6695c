import { useEffect, useState } from "react";

/**
 * Mobile browsers (iOS Safari especially) purge background tabs from memory and
 * restore them from the bfcache with a half-dead React tree — the classic blank
 * screen. We watch `visibilitychange` / `pageshow` and bump a key so the app
 * subtree remounts and reinitialises its state instantly.
 */
export function useAppRecovery(): number {
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (typeof document === "undefined") return;
    let hiddenAt = 0;

    const soften = () => setGeneration((g) => g + 1);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      // Only remount after a long background stint — short tab switches are fine.
      const away = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = 0;
      if (away > 60_000 || !document.body?.firstElementChild) soften();
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) soften();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return generation;
}
