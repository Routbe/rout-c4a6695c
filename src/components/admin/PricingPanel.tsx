import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notifyError, notifySuccess } from "@/lib/notify";
import { euro } from "@/lib/profile";
import { DEFAULT_PRICING } from "@/lib/pricing-settings";
import { getPricingSettings, savePricingSettings } from "@/lib/pricing.functions";
import { getBunqApiHealth } from "@/lib/bunq.functions";

interface FormState {
  baseCents: number;
  feeCard: number;
  feeBunq: number;
  feeSepa: number;
  minDonationCents: number;
}

const INITIAL: FormState = {
  baseCents: DEFAULT_PRICING.baseCents,
  feeCard: DEFAULT_PRICING.feeCents.card,
  feeBunq: DEFAULT_PRICING.feeCents.bunq,
  feeSepa: DEFAULT_PRICING.feeCents.sepa,
  minDonationCents: DEFAULT_PRICING.minDonationCents,
};

const FIELDS: { key: keyof FormState; label: string; hint: string; min: number }[] = [
  {
    key: "baseCents",
    label: "Basisprijs verificatie",
    hint: "Eenmalige Early Believer-verificatie",
    min: 0,
  },
  { key: "feeCard", label: "Toeslag kaart / Apple Pay", hint: "Direct actief", min: 0 },
  { key: "feeBunq", label: "Toeslag bunq", hint: "QR / bunq.me, 1–2 minuten", min: 0 },
  { key: "feeSepa", label: "Toeslag overschrijving (SEPA)", hint: "Handmatige match", min: 0 },
  {
    key: "minDonationCents",
    label: "Minimale bijdrage",
    hint: "Ondergrens voor eenmalige en terugkerende bijdragen",
    min: 1,
  },
];

/** Adminformulier voor het dynamische prijsbeleid (`pricing_settings`). */
export function PricingPanel() {
  const load = useServerFn(getPricingSettings);
  const save = useServerFn(savePricingSettings);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const checkBunq = useServerFn(getBunqApiHealth);
  // Compacte bunq-healthcheck: de SessionServer-verbinding bij het openen.
  const [bunqHealth, setBunqHealth] = useState<{
    ok: boolean;
    message: string;
    configured: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void checkBunq()
      .then((res) => {
        if (!cancelled) setBunqHealth(res);
      })
      .catch(() => {
        if (!cancelled) setBunqHealth({ ok: false, message: "Status onbekend", configured: true });
      });
    return () => {
      cancelled = true;
    };
  }, [checkBunq]);

  useEffect(() => {
    let cancelled = false;
    void load()
      .then((p) => {
        if (cancelled || !p) return;
        setForm({
          baseCents: p.baseCents,
          feeCard: p.feeCents.card,
          feeBunq: p.feeCents.bunq,
          feeSepa: p.feeCents.sepa,
          minDonationCents: p.minDonationCents,
        });
      })
      .catch(() => notifyError("Kon de prijzen niet laden."))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    for (const field of FIELDS) {
      const value = form[field.key];
      if (!Number.isFinite(value) || value < field.min) {
        next[field.key] =
          field.min > 0 ? `Minimaal ${euro(field.min)}.` : "Geen negatieve bedragen.";
      }
      if (value > 1_000_000) next[field.key] = "Dat bedrag is te hoog.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      const res = await save({ data: form });
      if (res.ok) notifySuccess("Prijzen opgeslagen — de checkout gebruikt ze direct.");
    } catch (err) {
      console.error("[admin] prijzen opslaan mislukt", err);
      notifyError("Opslaan mislukt. Probeer opnieuw.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      {/* Compacte bunq API-health, zichtbaar zodra de pagina opent. */}
      <div
        role="status"
        className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${
          bunqHealth === null
            ? "border-border bg-background text-muted-foreground"
            : bunqHealth.ok
              ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-destructive/50 bg-destructive/10 text-destructive"
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full ${
            bunqHealth === null
              ? "bg-muted-foreground"
              : bunqHealth.ok
                ? "bg-emerald-500"
                : "bg-destructive"
          }`}
          aria-hidden
        />
        bunq API Status:{" "}
        {bunqHealth === null
          ? "controleren…"
          : bunqHealth.ok
            ? "Actief (200 OK)"
            : !bunqHealth.configured
              ? "Niet geconfigureerd"
              : "Offline"}
      </div>

      <div>
        <h2 className="text-sm font-semibold">Prijzen &amp; toeslagen</h2>
        <p className="text-[11px] text-muted-foreground">
          Deze bedragen sturen de checkout live aan: basisprijs, toeslag per betaalmethode en de
          minimale bijdrage.
        </p>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Laden…
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map((field) => (
              <div key={field.key} className="space-y-1">
                <Label htmlFor={`pricing-${field.key}`} className="text-xs font-semibold">
                  {field.label}
                </Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">€</span>
                  <Input
                    id={`pricing-${field.key}`}
                    type="number"
                    min={field.min / 100}
                    step="0.01"
                    value={(form[field.key] / 100).toString()}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        [field.key]:
                          e.target.value === "" ? 0 : Math.round(Number(e.target.value) * 100),
                      }))
                    }
                    className="input-field h-9 w-36 rounded-xl text-xs"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">{field.hint}</p>
                {errors[field.key] && (
                  <p className="text-[11px] text-destructive">{errors[field.key]}</p>
                )}
              </div>
            ))}
          </div>

          <dl className="grid gap-1 rounded-xl border border-border bg-muted/40 p-3 text-[11px]">
            <div className="flex justify-between">
              <dt>Totaal kaart</dt>
              <dd className="tabular-nums">{euro(form.baseCents + form.feeCard)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Totaal bunq</dt>
              <dd className="tabular-nums">{euro(form.baseCents + form.feeBunq)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Totaal overschrijving</dt>
              <dd className="tabular-nums">{euro(form.baseCents + form.feeSepa)}</dd>
            </div>
          </dl>

          <Button
            type="button"
            className="h-9 rounded-xl text-xs font-semibold"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Save className="mr-2 h-3.5 w-3.5" aria-hidden />
            )}
            Prijzen opslaan
          </Button>
        </>
      )}
    </section>
  );
}
