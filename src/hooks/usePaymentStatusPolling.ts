import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { pollPaymentStatus } from "@/lib/verification.functions";

export interface PaymentPollResult {
  status: string | null;
  at: string | null;
  /** True zodra de veiligheidstimer afliep zonder bevestigde betaling. */
  timedOut: boolean;
  /** Herstart de detectie na een time-out (knop "Probeer opnieuw"). */
  retry: () => void;
}

/** Statussen waarbij de betaling nog onderweg is en pollen zinvol blijft. */
const OPEN_STATUSES = new Set(["pending", "processing", "incomplete", "requires_action"]);

/** Veiligheidstimer: na drie minuten stopt het pollen met een nette foutstaat. */
export const PAYMENT_POLL_TIMEOUT_MS = 3 * 60_000;

/**
 * Live statusdetectie voor asynchrone betalingen (Bancontact/iDEAL-redirect,
 * QR, overschrijving).
 *
 * Zolang de laatste betaling openstaat vraagt deze hook elke paar seconden de
 * server om de echte status bij Stripe te verzoenen. De server activeert en
 * mailt; hier verversen we enkel het scherm. Het pollen pauzeert wanneer het
 * tabblad onzichtbaar is en stopt na drie minuten met `timedOut`, zodat het
 * wachtscherm nooit oneindig blijft draaien. Alle timers worden opgeruimd bij
 * unmount, bij succes en bij de time-out.
 */
export function usePaymentStatusPolling(
  enabled: boolean,
  onPaid?: () => void,
  paymentId?: string | null,
): PaymentPollResult {
  const poll = useServerFn(pollPaymentStatus);
  const [result, setResult] = useState<{ status: string | null; at: string | null }>({
    status: null,
    at: null,
  });
  const [timedOut, setTimedOut] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  const retry = useCallback(() => {
    setTimedOut(false);
    setAttempt((a) => a + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: number | undefined;
    const startedAt = Date.now();

    const stop = () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };

    const tick = async () => {
      if (document.visibilityState === "hidden") return schedule();
      try {
        const res = await poll({ data: paymentId ? { paymentId } : {} });
        if (cancelled) return;
        setResult({ status: res.status ?? null, at: res.at ?? null });
        if (res.paid) {
          onPaidRef.current?.();
          return stop(); // klaar: geen nieuwe ronde meer
        }
        if (res.status && !OPEN_STATUSES.has(res.status)) return stop();
      } catch {
        /* tijdelijke fout: de volgende ronde probeert opnieuw */
      }
      schedule();
    };

    const schedule = () => {
      if (cancelled) return;
      if (Date.now() - startedAt >= PAYMENT_POLL_TIMEOUT_MS) {
        setTimedOut(true);
        return stop();
      }
      timer = window.setTimeout(() => void tick(), 4_000);
    };

    setTimedOut(false);
    void tick();

    return stop;
  }, [enabled, paymentId, poll, attempt]);

  return { status: result.status, at: result.at, timedOut, retry };
}
