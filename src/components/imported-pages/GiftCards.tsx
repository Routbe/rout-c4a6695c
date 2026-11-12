import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Gift, Loader2, Truck } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { GiftCard3D } from "@/components/gift/GiftCard3D";
import { startGiftCardPurchase } from "@/lib/gift-cards.functions";
import {
  GIFT_DESIGNS,
  GIFT_MAX_CENTS,
  GIFT_MIN_CENTS,
  GIFT_PRESETS,
  clampGiftAmount,
  euro,
} from "@/lib/gift-cards";
import { i18n as trI18n } from "@/lib/i18n";

/** Publieke aankooppagina voor cadeaubonnen, met live 3D-voorbeeld. */
export default function GiftCards() {
  const buy = useServerFn(startGiftCardPurchase);
  const [amount, setAmount] = useState<number>(2500);
  const [customAmount, setCustomAmount] = useState("");
  const [design, setDesign] = useState<string>(GIFT_DESIGNS[0].id);
  const [purchaserEmail, setPurchaserEmail] = useState("");
  const [purchaserName, setPurchaserName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [message, setMessage] = useState("");
  const [physical, setPhysical] = useState(false);
  const [ship, setShip] = useState({
    name: "",
    line1: "",
    postalCode: "",
    city: "",
    country: "BE",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("status") === "success") {
      toast.success(trI18n.t("ui.da3f0348fe"));
    } else if (params.get("status") === "cancelled") {
      toast.info(trI18n.t("ui.fa9ac84094"));
    }
  }, []);

  const effectiveAmount = useMemo(() => {
    return clampGiftAmount(amount);
  }, [amount, customAmount]);

  async function submit() {
    if (!purchaserEmail) {
      toast.error(trI18n.t("ui.b87e9329f9"));
      return;
    }
    setBusy(true);
    try {
      const result = await buy({
        data: {
          amountCents: effectiveAmount,
          purchaserEmail,
          purchaserName: purchaserName || null,
          recipientEmail: recipientEmail || null,
          recipientName: recipientName || null,
          message: message || null,
          design,
          physicalDelivery: physical,
          ship: physical ? ship : null,
          origin: window.location.origin,
        },
      });
      if (!result.ok) {
        const messages: Record<string, string> = {
          shipping_country_unsupported: "Gratis fysieke levering geldt alleen binnen België.",
          shipping_address_incomplete: "Vul straat, postcode en gemeente in voor fysieke levering.",
          stripe_not_configured:
            "Betalen is tijdelijk niet beschikbaar. Probeer het later opnieuw.",
        };
        toast.error(messages[result.reason] ?? "Aankoop mislukt. Probeer het opnieuw.");
        return;
      }
      window.location.href = result.url;
    } catch {
      toast.error(trI18n.t("ui.b6b7c6ec52"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-5xl px-4 py-12">
        <header className="mb-10 max-w-2xl">
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-muted-foreground">
            <Gift className="h-4 w-4" /> Cadeaubon
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Geef ROUT cadeau
          </h1>
          <p className="mt-3 text-muted-foreground">
            De ontvanger krijgt de bon digitaal per mail (PDF + 3D-weergave) en kan de code meteen
            gebruiken bij het afrekenen. In België sturen we de bon ook gratis fysiek op.
          </p>
        </header>

        <div className="grid gap-10 lg:grid-cols-[1fr_420px]">
          <div className="space-y-8">
            <section className="space-y-3">
              <Label>Bedrag</Label>
              <div className="flex flex-wrap gap-2">
                {GIFT_PRESETS.map((cents) => (
                  <Button
                    key={cents}
                    type="button"
                    variant={!customAmount && amount === cents ? "default" : "outline"}
                    onClick={() => {
                      setCustomAmount("");
                      setAmount(cents);
                    }}
                  >
                    {euro(cents)}
                  </Button>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <Label>Ontwerp</Label>
              <div className="flex flex-wrap gap-2">
                {GIFT_DESIGNS.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={design === d.id}
                    onClick={() => setDesign(d.id)}
                    className={`rounded-full border px-4 py-2 text-sm transition ${
                      design === d.id ? "border-foreground" : "border-border text-muted-foreground"
                    }`}
                  >
                    <span
                      className="mr-2 inline-block h-3 w-3 rounded-full align-middle"
                      style={{ background: d.front, border: `1px solid ${d.accent}` }}
                    />
                    {d.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="gift-buyer-email">Jouw e-mail (factuur)</Label>
                <Input
                  id="gift-buyer-email"
                  type="email"
                  value={purchaserEmail}
                  onChange={(e) => setPurchaserEmail(e.target.value)}
                  placeholder="jij@voorbeeld.be"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gift-buyer-name">Jouw naam</Label>
                <Input
                  id="gift-buyer-name"
                  value={purchaserName}
                  onChange={(e) => setPurchaserName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gift-to-email">E-mail ontvanger</Label>
                <Input
                  id="gift-to-email"
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="Optioneel — anders krijg jij de bon"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gift-to-name">Naam ontvanger</Label>
                <Input
                  id="gift-to-name"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="gift-message">Persoonlijke boodschap</Label>
                <Textarea
                  id="gift-message"
                  rows={3}
                  maxLength={400}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>
            </section>

            <section className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="flex items-center gap-2 font-medium">
                    <Truck className="h-4 w-4" /> Fysieke bon opsturen
                  </p>
                  <p className="text-sm text-muted-foreground">Gratis binnen België.</p>
                </div>
                <Switch
                  checked={physical}
                  onCheckedChange={setPhysical}
                  aria-label="Fysieke levering"
                />
              </div>
              {physical ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Input
                    placeholder="Naam op de zending"
                    value={ship.name}
                    onChange={(e) => setShip({ ...ship, name: e.target.value })}
                  />
                  <Input
                    placeholder="Straat en nummer"
                    value={ship.line1}
                    onChange={(e) => setShip({ ...ship, line1: e.target.value })}
                  />
                  <Input
                    placeholder="Postcode"
                    value={ship.postalCode}
                    onChange={(e) => setShip({ ...ship, postalCode: e.target.value })}
                  />
                  <Input
                    placeholder="Gemeente"
                    value={ship.city}
                    onChange={(e) => setShip({ ...ship, city: e.target.value })}
                  />
                </div>
              ) : null}
            </section>

            <Button onClick={submit} disabled={busy} size="lg">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Bon van {euro(effectiveAmount)} kopen
            </Button>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <GiftCard3D
              code="GIFT-XXXX-XXXX"
              amountCents={effectiveAmount}
              design={design}
              recipientName={recipientName || null}
              purchaserName={purchaserName || null}
              message={message || null}
              revealCode={false}
            />
          </aside>
        </div>
      </div>
    </AppLayout>
  );
}
