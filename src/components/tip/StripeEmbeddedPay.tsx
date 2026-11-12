import { useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = { clientSecret: string; publishableKey: string; returnUrl: string; label: string; onCancel: () => void };

/** Stripe's eigen betaalvenster, ingebed op de steunpagina (geen doorsturen). Geld gaat naar het account van de maker. */
export default function StripeEmbeddedPay(props: Props) {
  const stripePromise = useMemo(() => loadStripe(props.publishableKey), [props.publishableKey]);
  return (
    <Elements stripe={stripePromise} options={{ clientSecret: props.clientSecret, appearance: { theme: "stripe" } }}>
      <Inner {...props} />
    </Elements>
  );
}

function Inner({ returnUrl, label, onCancel }: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!stripe || !elements) return;
        setBusy(true);
        setError(null);
        const { error: err } = await stripe.confirmPayment({ elements, confirmParams: { return_url: returnUrl } });
        setBusy(false);
        if (err) setError(err.message ?? "Betaling mislukt.");
      }}
    >
      <PaymentElement />
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" className="h-12 flex-1 rounded-full" disabled={!stripe || busy}>
          {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} {label}
        </Button>
        <Button type="button" variant="ghost" className="h-12 rounded-full" onClick={onCancel}>
          Annuleren
        </Button>
      </div>
    </form>
  );
}
