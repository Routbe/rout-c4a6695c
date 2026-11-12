import { useEffect, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@/lib/router-compat";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { GiftCard3D } from "@/components/gift/GiftCard3D";
import { getPublicGiftCard } from "@/lib/gift-cards.functions";
import { euro, type PublicGiftCard } from "@/lib/gift-cards";

/** Publieke 3D-weergave van één cadeaubon via de link in de mail. */
export default function GiftCardView() {
  const params = useParams({ strict: false }) as { code?: string };
  const load = useServerFn(getPublicGiftCard);
  const [card, setCard] = useState<PublicGiftCard | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    const code = params.code;
    if (!code) {
      setState("missing");
      return;
    }
    load({ data: { code } })
      .then((result) => {
        if (result.card) {
          setCard(result.card);
          setState("ready");
        } else {
          setState("missing");
        }
      })
      .catch(() => setState("missing"));
  }, [params.code, load]);

  return (
    <AppLayout>
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 py-16 text-center">
        {state === "loading" ? <p className="text-muted-foreground">Bon wordt geladen…</p> : null}

        {state === "missing" ? (
          <>
            <h1 className="text-2xl font-semibold">Deze cadeaubon bestaat niet (meer)</h1>
            <p className="mt-3 text-muted-foreground">
              Controleer de link uit je e-mail, of koop een nieuwe bon.
            </p>
            <Button asChild className="mt-6">
              <Link to="/gift">Naar de cadeaubonnen</Link>
            </Button>
          </>
        ) : null}

        {state === "ready" && card ? (
          <>
            <h1 className="text-3xl font-semibold tracking-tight">
              Een ROUT-cadeaubon van {euro(card.amountCents)}
            </h1>
            <p className="mt-3 max-w-xl text-muted-foreground">
              {card.redeemed
                ? "Deze bon is al ingewisseld."
                : "Vul de code in bij het afrekenen op rout.be — de bon blijft geldig tot ze gebruikt is."}
            </p>
            <div className="mt-10 flex justify-center">
              <GiftCard3D
                code={card.code}
                amountCents={card.amountCents}
                design={card.design}
                recipientName={card.recipientName}
                purchaserName={card.purchaserName}
                message={card.message}
                revealCode={!card.redeemed}
              />
            </div>
            {card.fulfilmentStatus !== "not_applicable" ? (
              <p className="mt-6 text-sm text-muted-foreground">
                Fysieke levering:{" "}
                <strong className="text-foreground">
                  {card.fulfilmentStatus === "pending_print"
                    ? "wordt gedrukt"
                    : card.fulfilmentStatus === "packaged"
                      ? "ingepakt"
                      : "verzonden"}
                </strong>
                {card.trackingCode ? ` · tracking ${card.trackingCode}` : ""}
              </p>
            ) : null}
            {!card.redeemed ? (
              <Button asChild className="mt-8">
                <Link to="/dashboard">Bon gebruiken</Link>
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </AppLayout>
  );
}
