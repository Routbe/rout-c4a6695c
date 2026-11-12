import { useEffect, useState } from "react";
import { normalizeHandleForStorage } from "@/lib/handle-rules";

export type HandleAvailabilityState = "idle" | "checking" | "available" | "taken" | "error";

export interface HandleAvailability {
  state: HandleAvailabilityState;
  handle: string;
  reason: string | null;
}

/**
 * Debounced (300 ms) beschikbaarheidscheck voor handles.
 *
 * Vraagt alleen `/api/profiles/check-handle` aan zodra de handle syntactisch
 * geldig is, zodat het veld nooit "bezet" roept terwijl er nog een regelfout
 * openstaat.
 */
export function useHandleAvailability(raw: string, hasRuleError = false): HandleAvailability {
  const handle = normalizeHandleForStorage(raw);
  const [result, setResult] = useState<HandleAvailability>({
    state: "idle",
    handle: "",
    reason: null,
  });

  useEffect(() => {
    if (!handle || hasRuleError) {
      setResult({ state: "idle", handle, reason: null });
      return;
    }

    let cancelled = false;
    setResult({ state: "checking", handle, reason: null });

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/profiles/check-handle?handle=${encodeURIComponent(handle)}`,
            {
              headers: { accept: "application/json" },
              credentials: "same-origin",
            },
          );
          const body = (await res.json()) as { available?: boolean; reason?: string | null };
          if (cancelled) return;
          setResult({
            state: body.available ? "available" : "taken",
            handle,
            reason: body.reason ?? null,
          });
        } catch {
          if (!cancelled) setResult({ state: "error", handle, reason: null });
        }
      })();
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [handle, hasRuleError]);

  return result;
}
