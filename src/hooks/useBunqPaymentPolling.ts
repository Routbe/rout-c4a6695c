import { useCallback, useEffect, useRef, useState } from "react";
import { nextPollDelayMs } from "@/lib/payment-polling";

export interface BunqTabRef {
  tabId: number;
  accountId: number;
  paymentId: string;
}

export type BunqPollStatus = "idle" | "waiting" | "paid" | "timeout" | "error";

/** Veiligheidstimer: na drie minuten stopt het wachtscherm met een foutstaat. */
export const BUNQ_POLL_TIMEOUT_MS = 3 * 60_000;

export interface BunqPollResult {
  status: BunqPollStatus;
  /** Herstart de detectie na een time-out ("Probeer opnieuw"). */
  retry: () => void;
}

/**
 * Live betaalstatus-detectie voor de bunq-checkout.
 *
 * Zodra de bunq.me-tab bestaat pollt deze hook `/api/bunq/check-status` volgens
 * het gedeelde, aflopende schema (elke 5s in de eerste minuten). De server
 * activeert bij `PAID` de verificatie (profiel op geverifieerd, `verified_at`,
 * bevestigingsmail via Brevo) en de hook stopt daarna meteen met pollen.
 *
 * Blijft de betaling drie minuten uit, dan stoppen we het interval eveneens en
 * krijgt het scherm een duidelijke time-outstaat met een retry-knop. Elke timer
 * wordt opgeruimd bij unmount, bij succes en bij de time-out.
 */
export function useBunqPaymentPolling(tab: BunqTabRef | null, onPaid?: () => void): BunqPollResult {
  const [status, setStatus] = useState<BunqPollStatus>("idle");
  const [attempt, setAttempt] = useState(0);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    if (!tab) {
      setStatus("idle");
      return;
    }

    let cancelled = false;
    let timer = 0;
    const startedAt = Date.now();
    setStatus("waiting");

    const stop = () => {
      cancelled = true;
      window.clearTimeout(timer);
    };

    const schedule = () => {
      if (cancelled) return;
      const elapsed = Date.now() - startedAt;
      if (elapsed >= BUNQ_POLL_TIMEOUT_MS) {
        setStatus("timeout");
        return stop();
      }
      timer = window.setTimeout(tick, nextPollDelayMs(elapsed));
    };

    const tick = async () => {
      try {
        const res = await fetch(
          `/api/bunq/check-status?tab_id=${tab.tabId}&account_id=${tab.accountId}&payment_id=${encodeURIComponent(tab.paymentId)}`,
          { headers: { accept: "application/json" }, credentials: "same-origin" },
        );
        if (cancelled) return;
        if (res.ok) {
          const body = (await res.json()) as { status?: string; done?: boolean };
          if (cancelled) return;
          if (body.status === "PAID" || body.done) {
            setStatus("paid");
            onPaidRef.current?.();
            return stop();
          }
        }
      } catch {
        /* tijdelijke netwerkfout: de volgende tick probeert opnieuw */
      }
      schedule();
    };

    void tick();

    return stop;
  }, [tab?.tabId, tab?.accountId, tab?.paymentId, tab, attempt]);

  return { status, retry };
}
