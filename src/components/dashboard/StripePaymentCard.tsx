import { useMemo, useRef, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Appearance, type Stripe } from "@stripe/stripe-js";
import { BadgeCheck, Loader2, Lock } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { euro } from "@/lib/profile";
import { useI18n } from "@/lib/i18n";
import { confirmCardPaymentIntent } from "@/lib/verification.functions";
import { usePaymentIntentPolling, type PaymentIntentRef } from "@/hooks/usePaymentIntentPolling";

/** ROUT dark-mode huisstijl voor het Payment Element. */
const APPEARANCE: Appearance = {
  theme: "night",
  variables: {
    colorPrimary: "#2563EB",
    colorBackground: "#111111",
    colorText: "#F6F6F4",
    borderRadius: "8px",
  },
};

/** Publishable keys zijn publiek; caching voorkomt herladen van Stripe.js. */
const stripeCache = new Map<string, Promise<Stripe | null>>();
function stripeFor(key: string) {
  let promise = stripeCache.get(key);
  if (!promise) {
    promise = loadStripe(key);
    stripeCache.set(key, promise);
  }
  return promise;
}

export interface StripePaymentCardProps {
  publishableKey: string;
  clientSecret: string;
  intentId: string;
  paymentId: string;
  amountCents: number;
  profileUrl: string;
  onPaid?: () => void;
}

/** Embedded Stripe Elements checkout inside the ROUT dashboard. */
export function StripePaymentCard(props: StripePaymentCardProps) {
  const stripePromise = useMemo(() => stripeFor(props.publishableKey), [props.publishableKey]);

  return (
    <Elements
      options={{ clientSecret: props.clientSecret, appearance: APPEARANCE }}
      stripe={stripePromise}
    >
      <PaymentForm {...props} />
    </Elements>
  );
}

/** Vertaalt Stripe-/bankfoutcodes naar één heldere zin voor de gebruiker. */
function messageForCode(
  code: string | null | undefined,
  declineCode: string | null | undefined,
  t: (key: string) => string,
): string {
  if (declineCode === "insufficient_funds" || code === "insufficient_funds") {
    return t("pay.err.insufficient");
  }
  // Stripe Radar of de uitgever blokkeert de transactie: geen retry-lus, wel
  // een heldere uitleg met een alternatief.
  if (
    declineCode === "fraudulent" ||
    declineCode === "merchant_blacklist" ||
    declineCode === "pickup_card" ||
    declineCode === "do_not_honor" ||
    declineCode === "stolen_card" ||
    code === "card_decline_rate_limit_exceeded" ||
    code === "blocked"
  ) {
    return t("pay.err.blocked");
  }
  if (declineCode === "lost_card" || code === "lost_card" || code === "stolen_card") {
    return t("pay.err.card_lost");
  }
  if (
    code === "authentication_required" ||
    code === "payment_intent_authentication_failure" ||
    declineCode === "authentication_required"
  ) {
    return t("pay.err.3ds");
  }
  if (code === "expired_card" || declineCode === "expired_card") return t("pay.err.expired_card");
  if (code === "card_declined" || code === "card_error" || declineCode)
    return t("pay.err.declined");
  return t("pay.err.checkout");
}

/**
 * Absolute terugkeer-URL voor redirect-betaalmethodes (Klarna, Bancontact,
 * iDEAL, 3DS-bankapps). Stripe vereist een `return_url` zodra de gekozen
 * methode een omleiding nodig heeft; zonder absolute URL weigert Stripe.js de
 * bevestiging al vóór de request. Queryparams van de huidige pagina worden
 * bewust weggelaten zodat de terugkeer altijd schoon start.
 */
function checkoutReturnUrl(intentId: string, paymentId: string): string {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set("payment", "return");
  url.searchParams.set("intent", intentId);
  url.searchParams.set("payment_id", paymentId);
  return url.toString();
}

function PaymentForm({
  clientSecret,
  intentId,
  paymentId,
  amountCents,
  profileUrl,
  onPaid,
}: StripePaymentCardProps) {
  const stripe = useStripe();
  const elements = useElements();
  const { t } = useI18n();
  const confirmOnServer = useServerFn(confirmCardPaymentIntent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"form" | "processing" | "paid">("form");
  /** Zodra dit gezet is, pollt de app de intent volgens het trage schema. */
  const [pollRef, setPollRef] = useState<PaymentIntentRef | null>(null);

  // Asynchrone methodes (Bancontact/iDEAL/Klarna, QR, overschrijving) worden
  // buiten de browser afgerond: zodra Stripe of de webhook `succeeded` meldt,
  // springt dit scherm automatisch naar het succes-beeld.
  const intentPoll = usePaymentIntentPolling(
    pollRef,
    () => {
      setPollRef(null);
      setState("paid");
      onPaid?.();
    },
    () => {
      setPollRef(null);
      setState("form");
      setError(t("pay.status.failed"));
    },
  );
  /**
   * Voert de 3DS-/SCA-stap uit die Stripe nog open heeft staan.
   *
   * `confirmPayment` handelt de challenge normaal zelf af, maar bij sommige
   * kaarten en banken (Wise, Revolut, klassieke banken met eigen app) blijft de
   * intent op `requires_action` staan — bijvoorbeeld wanneer de challenge pas
   * na de confirm door de issuer wordt opgelegd. Dan moet de frontend expliciet
   * `handleNextAction()` aanroepen; anders ziet de gebruiker een weigering
   * terwijl de bank nog op zijn goedkeuring wacht.
   *
   * Retourneert `true` wanneer de betaling na de verificatie geslaagd is,
   * `false` wanneer de bank weigerde, en `null` wanneer het buiten de browser
   * doorloopt (dan pollen we verder).
   */
  const runNextAction = async (): Promise<boolean | null> => {
    if (!stripe || !clientSecret) return null;
    const next = await stripe.handleNextAction({ clientSecret });
    if (next.error) {
      setError(
        next.error.code || next.error.decline_code
          ? messageForCode(next.error.code, next.error.decline_code, t)
          : (next.error.message ?? t("pay.err.3ds")),
      );
      return false;
    }
    const status = next.paymentIntent?.status;
    if (status === "succeeded") return true;
    if (status === "requires_payment_method") {
      setError(t("pay.err.3ds"));
      return false;
    }
    return null;
  };

  /** Harde slot tegen dubbele submits: state komt pas na de re-render. */
  const submitting = useRef(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      // Valideer de invoer eerst; anders krijgt de gebruiker pas na de
      // 3DS-stap te horen dat er een veld ontbreekt.
      const submitResult = await elements.submit();
      if (submitResult.error) {
        setError(submitResult.error.message ?? t("pay.err.checkout"));
        return;
      }

      // `redirect: "if_required"` opent de 3DS-challenge in een modal wanneer
      // dat kan, en stuurt door naar de bank of de Klarna/Bancontact-pagina
      // wanneer de methode dat eist. De `return_url` is verplicht zodra een
      // redirect nodig is — zonder deze weigert Stripe.js de bevestiging.
      const result = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
        confirmParams: {
          return_url: checkoutReturnUrl(intentId, paymentId),
        },
      });
      if (result.error) {
        // Een openstaande bankverificatie is géén fout: Stripe meldt dit als
        // `payment_intent_authentication_failure` zodra de challenge nog niet
        // is voltooid. We starten de 3DS-stap dan alsnog in plaats van de
        // betaling af te keuren.
        const needsAuth =
          result.error.code === "payment_intent_authentication_failure" ||
          result.error.code === "authentication_required" ||
          result.error.decline_code === "authentication_required" ||
          result.error.payment_intent?.status === "requires_action";
        if (needsAuth) {
          setState("processing");
          const outcome3ds = await runNextAction();
          if (outcome3ds === false) {
            setState("form");
            return;
          }
          if (outcome3ds === null) {
            setPollRef({ intentId, paymentId });
            return;
          }
        } else {
          // Integratie-/validatiefouten (bv. ontbrekende return_url) tonen we
          // letterlijk zodat configuratieproblemen nooit worden gemaskeerd;
          // bekende bankcodes krijgen een vertaalde, vriendelijke melding.
          const known =
            result.error.code || result.error.decline_code
              ? messageForCode(result.error.code, result.error.decline_code, t)
              : null;
          setError(known ?? result.error.message ?? t("pay.err.checkout"));
          return;
        }
      } else if (result.paymentIntent?.status === "requires_action") {
        // Stripe.js kon de challenge niet inline afronden (bankapp, eigen
        // 3DS-venster): expliciet de next action uitvoeren.
        setState("processing");
        const outcome3ds = await runNextAction();
        if (outcome3ds === false) {
          setState("form");
          return;
        }
        if (outcome3ds === null) {
          setPollRef({ intentId, paymentId });
          return;
        }
      }

      // De server bevestigt de status bij Stripe zelf en activeert de verificatie.
      const outcome = await confirmOnServer({ data: { intentId, paymentId } });
      if (outcome.ok && outcome.status === "succeeded") {
        setState("paid");
        onPaid?.();
      } else if (outcome.ok && outcome.status === "processing") {
        // Asynchroon: blijf de status opvolgen tot Stripe of de webhook bevestigt.
        setState("processing");
        setPollRef({ intentId, paymentId });
      } else if (!outcome.ok && outcome.reason === "requires_action") {
        // Nog een openstaande bankverificatie: eerst zelf de 3DS-stap
        // aanbieden, en alleen pollen wanneer die buiten de browser doorloopt.
        setState("processing");
        const outcome3ds = await runNextAction();
        if (outcome3ds === true) {
          const again = await confirmOnServer({ data: { intentId, paymentId } });
          if (again.ok && again.status === "succeeded") {
            setState("paid");
            onPaid?.();
            return;
          }
          setPollRef({ intentId, paymentId });
          return;
        }
        if (outcome3ds === false) {
          setState("form");
          return;
        }
        setPollRef({ intentId, paymentId });
      } else if (!outcome.ok && outcome.reason === "not_paid") {
        setError(messageForCode(outcome.errorCode, outcome.declineCode, t));
      } else {
        setError(t("pay.err.checkout"));
      }
    } catch (err) {
      console.error("[pay] stripe elements confirm failed", err);
      setError(t("pay.err.generic"));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  if (state === "paid") {
    return (
      <div className="animate-in fade-in zoom-in-95 space-y-3 rounded-xl border border-primary bg-primary/10 p-5 text-center duration-500">
        <BadgeCheck className="mx-auto h-10 w-10 text-primary" aria-hidden />
        <p className="text-sm font-semibold">{t("pay.card.paid")}</p>
        <Button asChild className="h-10 w-full rounded-xl text-sm font-semibold">
          <a href={profileUrl}>{t("pay.card.view_profile")}</a>
        </Button>
      </div>
    );
  }

  if (state === "processing") {
    // Na drie minuten stopt de polling: toon een duidelijke uitweg in plaats
    // van een oneindig draaiend wachtscherm.
    if (intentPoll.timedOut) {
      return (
        <div className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <p role="alert" className="text-xs text-foreground">
            Betaling niet gedetecteerd of verlopen. Probeer opnieuw.
          </p>
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full rounded-xl text-sm font-semibold"
            onClick={() => {
              setError(null);
              setState("form");
              setPollRef(null);
              intentPoll.retry();
            }}
          >
            Probeer opnieuw
          </Button>
        </div>
      );
    }
    return (
      <p className="rounded-xl border border-border bg-muted/50 p-4 text-xs text-muted-foreground">
        {t("pay.status.processing")}
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="space-y-3 rounded-xl border border-border p-4"
    >
      <PaymentElement options={{ layout: "tabs" }} />
      {error && (
        <p role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      )}
      <Button
        type="submit"
        className="h-11 w-full rounded-xl text-sm font-semibold"
        disabled={busy || !stripe || !elements}
      >
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Lock className="mr-2 h-4 w-4" aria-hidden />
        )}
        {t("pay.continue.card", { total: euro(amountCents) })}
      </Button>
      <p className="text-center text-[11px] text-muted-foreground">
        Beveiligde betaling via Stripe — je kaartgegevens verlaten nooit ROUT.
      </p>
    </form>
  );
}
