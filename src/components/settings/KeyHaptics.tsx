import { useEffect } from "react";

const KEY_SELECTOR =
  '[data-tactile], .wallet-vault-key, .spatial-button:is([data-spatial-control="default"],[data-spatial-control="destructive"],[data-spatial-control="matcha"])';

/** Short "thock" on phones when a keycap is pressed — internal mechanical UI only. */
export function KeyHaptics() {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const root = document.documentElement;
      if (root.dataset.workspaceUi !== "internal" || root.dataset.theme !== "mechanical") return;
      if (e.pointerType === "mouse") return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const el = (e.target as Element | null)?.closest?.(KEY_SELECTOR);
      if (!el || el.closest("[data-profile-theme],[data-interface-artwork]")) return;
      if ((el as HTMLButtonElement).disabled) return;
      try { navigator.vibrate?.(10); } catch { /* unsupported */ }
    };
    document.addEventListener("pointerdown", onDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);
  return null;
}
