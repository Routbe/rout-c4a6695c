import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { confirmCardPaymentIntent } from "@/lib/verification.functions";
import { nextPollDelayMs } from "@/lib/payment-polling";

export interface PaymentIntentRef {
  intentId: string;
  paymentId: string;
}

export type IntentPollStatus = "idle" | "waiting" | "paid" | "failed" | "timeout";

/** Veiligheidsgrens: na drie minuten wachten stopt de polling definitief. */
export const INTENT_POLL_TIMEOUT_MS = 3 * 60_000;

export interface IntentPollResult {
  status: IntentPollStatus;
  /** True zodra de wachttijd is verstreken zonder bevestigde betaling. */
  timedOut: boolean;
  /** Start een nieuwe wachtronde na een timeout. */
  retry: () => void;
}

/**
 * Slimme polling voor asynchrone Stripe-betalingen (Bancontact, iDEAL, Klarna,
 * QR/overschrijving): de bevestiging gebeurt buiten de browser om, dus we
 * vragen de server periodiek de echte status bij Stripe op.
 *
 * Het interval volgt het gedeelde schema (5s in de eerste 5 minuten, daarna
 * 1/2/5/10/30 minuten). Zodra Stripe `succeeded` meldt — of de webhook
 * `payment_intent.succeeded` de betaling al op `paid` heeft gezet — stopt de
 * polling en springt de UI meteen naar het succes-scherm. Blijft de betaling
 * drie minuten uit, dan stoppen alle timers en toont de UI een timeoutstaat.
 */
export function usePaymentIntentPolling(
  intent: PaymentIntentRef | null,
  onPaid?: () => void,
  onFailed?: (reason: string) => void,
): IntentPollResult {
  const confirm = useServerFn(confirmCardPaymentIntent);
  const [status, setStatus] = useState<IntentPollStatus>("idle");
  const [attempt, setAttempt] = useState(0);
  const onPaidRef = useRef(onPaid);
  const onFailedRef = useRef(onFailed);
  const confirmRef = useRef(confirm);
  onPaidRef.current = onPaid;
  onFailedRef.current = onFailed;
  confirmRef.current = confirm;

  useEffect(() => {
    if (!intent) {
      setStatus("idle");
      return;
    }

    let cancelled = false;
    let timer = 0;
    let deadline = 0;
    const startedAt = Date.now();
    setStatus("waiting");

    const stop = () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearTimeout(deadline);
    };

    const schedule = () => {
      if (cancelled) return;
      timer = window.setTimeout(tick, nextPollDelayMs(Date.now() - startedAt));
    };

    const tick = async () => {
      try {
        const res = await confirmRef.current({
          data: { intentId: intent.intentId, paymentId: intent.paymentId },
        });
        if (cancelled) return;
        if (res.ok && res.status === "succeeded") {
          stop();
          setStatus("paid");
          onPaidRef.current?.();
          return;
        }
        // Definitief mislukt of geannuleerd: verder pollen heeft geen zin.
        if (!res.ok && (res.reason === "not_found" || res.reason === "not_paid")) {
          const terminal =
            res.reason === "not_found" ||
            ("status" in res &&
              (res.status === "canceled" || res.status === "requires_payment_method"));
          if (terminal) {
            stop();
            setStatus("failed");
            onFailedRef.current?.(res.reason);
            return;
          }
        }
      } catch {
        /* netwerk- of sessiefout: de volgende tick probeert opnieuw */
      }
      schedule();
    };

    deadline = window.setTimeout(() => {
      stop();
      setStatus("timeout");
    }, INTENT_POLL_TIMEOUT_MS);

    void tick();

    return stop;
  }, [intent?.intentId, intent?.paymentId, intent, attempt]);

  return {
    status,
    timedOut: status === "timeout",
    retry: () => setAttempt((n) => n + 1),
  };
}
