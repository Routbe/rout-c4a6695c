import { useCallback, useRef } from "react";

/**
 * Keyboard behaviour for a `role="radiogroup"` picker.
 *
 * Arrow keys move focus (and selection) between the `[role="radio"]` children
 * in DOM order — which matches visual order for both the mobile scroll rows and
 * the desktop grids. Space/Enter activate the focused option, matching the
 * WAI-ARIA radio group pattern.
 */
export function useRovingRadioGroup<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);

  const items = useCallback(() => {
    const root = ref.current;
    if (!root) return [] as HTMLElement[];
    return Array.from(root.querySelectorAll<HTMLElement>('[role="radio"]:not([disabled])'));
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<T>) => {
      const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Enter"];
      if (!keys.includes(event.key)) return;

      const all = items();
      if (!all.length) return;
      const current = document.activeElement as HTMLElement | null;
      const index = current ? all.indexOf(current) : -1;

      if (event.key === " " || event.key === "Enter") {
        if (index < 0) return;
        event.preventDefault();
        all[index]?.click();
        return;
      }

      event.preventDefault();
      const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
      const start = index < 0 ? (forward ? -1 : 0) : index;
      const next = (start + (forward ? 1 : -1) + all.length) % all.length;
      const target = all[next];
      if (!target) return;
      target.focus();
      // Selection follows focus, per the ARIA radio group pattern.
      target.click();
    },
    [items],
  );

  /** tabIndex for each option: only the checked one is in the tab order. */
  const itemTabIndex = (checked: boolean, isFirst: boolean, anyChecked: boolean) =>
    checked || (!anyChecked && isFirst) ? 0 : -1;

  return { ref, onKeyDown, itemTabIndex };
}
