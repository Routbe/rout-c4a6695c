import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Generieke ongedaan-maken/opnieuw-doen geschiedenis voor een editor-snapshot.
 *
 * Werkwijze: de editor geeft bij elke render zijn volledige, serialiseerbare
 * snapshot mee. Wijzigt die snapshot, dan wordt hij (na een korte rustpauze,
 * zodat typen niet honderd stappen oplevert) op de undo-stapel gezet.
 * `undo()`/`redo()` roepen `apply()` aan met een eerdere/latere snapshot.
 */
export function useEditorHistory<T>({
  snapshot,
  apply,
  enabled = true,
  debounceMs = 400,
  limit = 60,
}: {
  snapshot: T;
  apply: (value: T) => void;
  enabled?: boolean;
  debounceMs?: number;
  limit?: number;
}) {
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const current = useRef<T | null>(null);
  const applying = useRef(false);
  const [, bump] = useState(0);
  const rerender = useCallback(() => bump((n) => n + 1), []);

  // Eerste snapshot vastleggen zodra de editor klaar is met laden.
  useEffect(() => {
    if (!enabled || current.current !== null) return;
    current.current = snapshot;
    rerender();
  }, [enabled, snapshot, rerender]);

  useEffect(() => {
    if (!enabled || current.current === null) return;
    if (applying.current) {
      applying.current = false;
      current.current = snapshot;
      return;
    }
    if (JSON.stringify(snapshot) === JSON.stringify(current.current)) return;
    const id = setTimeout(() => {
      if (current.current !== null) {
        past.current = [...past.current, current.current].slice(-limit);
        future.current = [];
      }
      current.current = snapshot;
      rerender();
    }, debounceMs);
    return () => clearTimeout(id);
  }, [snapshot, enabled, debounceMs, limit, rerender]);

  const undo = useCallback(() => {
    const prev = past.current[past.current.length - 1];
    if (prev === undefined) return;
    past.current = past.current.slice(0, -1);
    if (current.current !== null) future.current = [...future.current, current.current];
    applying.current = true;
    current.current = prev;
    apply(prev);
    rerender();
  }, [apply, rerender]);

  const redo = useCallback(() => {
    const next = future.current[future.current.length - 1];
    if (next === undefined) return;
    future.current = future.current.slice(0, -1);
    if (current.current !== null) past.current = [...past.current, current.current];
    applying.current = true;
    current.current = next;
    apply(next);
    rerender();
  }, [apply, rerender]);

  // Sneltoetsen: Ctrl/⌘+Z ongedaan maken, Ctrl/⌘+Y of ⇧+Ctrl/⌘+Z opnieuw.
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, undo, redo]);

  return {
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
