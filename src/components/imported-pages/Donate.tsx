import { useEffect, useMemo, useState } from "react";
import { useParams, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, HeartHandshake, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Altcha } from "@/components/Altcha";
import { takeProof } from "@/lib/altcha-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/UserAvatar";
import { ProfileBadge } from "@/components/profile/ProfileBadge";
import { cn } from "@/lib/utils";
import {
  getDonationStatus,
  getDonationTarget,
  startDonationCheckout,
} from "@/lib/donations.functions";
import type { BadgeNameFormat, BadgeType } from "@/lib/profile-display";
import { sanitizeHandleInput } from "@/lib/validations/sanitizeHandle";
import { i18n as trI18n } from "@/lib/i18n";

type Target = Awaited<ReturnType<typeof getDonationTarget>>;

const PRESETS = [500, 1000, 2500, 5000];
const euro = (cents: number) =>
  new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(cents / 100);

/** Publieke donatiepagina van een geverifieerde maker. */
export default function Donate() {
  const params = useParams({ strict: false }) as { username?: string };
  const search = useSearch({ strict: false }) as { donation?: string; status?: string };
  const handle = sanitizeHandleInput(params.username);

  const loadTarget = useServerFn(getDonationTarget);
  const loadStatus = useServerFn(getDonationStatus);
  const startCheckout = useServerFn(startDonationCheckout);

  const [target, setTarget] = useState<Target>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState(1000);
  const [custom, setCustom] = useState("");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const row = await loadTarget({ data: { handle } }).catch(() => null);
      if (alive) {
        setTarget(row);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [handle, loadTarget]);

  // Terug van Stripe: pollen tot de webhook de donatie bevestigd heeft.
  useEffect(() => {
    if (search.status !== "success" || !search.donation) return;
    let alive = true;
    let tries = 0;
    const tick = async () => {
      const status = await loadStatus({ data: { donationId: search.donation! } }).catch(() => null);
      if (!alive) return;
      if (status?.status === "paid") {
        setPaid(true);
        return;
      }
      tries += 1;
      if (tries < 10) setTimeout(() => void tick(), 1500);
      else setPaid(true); // asynchrone methodes (Bancontact/iDEAL) bevestigen later
    };
    void tick();
    return () => {
      alive = false;
    };
  }, [search.status, search.donation, loadStatus]);

  const effectiveCents = useMemo(() => {
    // Custom amounts are charged in 50-cent steps (enforced on the server);
    // round here so the button always shows the amount that will be charged.
    const parsed = Math.round(Number(custom.replace(",", ".")) * 2) * 50;
    return custom.trim() && Number.isFinite(parsed) ? parsed : amount;
  }, [custom, amount]);

  const submit = async () => {
    if (effectiveCents < 100) {
      toast.error(trI18n.t("ui.a0060d5bab"));
      return;
    }
    setSubmitting(true);
    const result = await startCheckout({
      data: {
        handle,
        amountCents: effectiveCents,
        message: message.trim() || null,
        supporterName: name.trim() || null,
        supporterEmail: email.trim() || null,
        origin: window.location.origin,
        altcha: await takeProof(),
      },
    }).catch(() => null);
    setSubmitting(false);

    if (result?.ok) {
      window.location.href = result.url;
      return;
    }
    toast.error(
      result?.reason === "stripe_not_configured"
        ? "Betalingen zijn nog niet geconfigureerd."
        : "Betaling starten lukte niet. Probeer opnieuw.",
    );
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0d0c0b]">
        <Loader2 className="h-5 w-5 animate-spin text-[#e8e2d6]/60" />
      </main>
    );
  }

  if (!target) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0d0c0b] px-6 text-center">
        <div className="max-w-sm space-y-2">
          <h1 className="text-lg font-medium text-[#f4efe4]">Geen donatiepagina</h1>
          <p className="text-sm text-[#f4efe4]/60">@{handle} ontvangt (nog) geen steun via ROUT.</p>
        </div>
      </main>
    );
  }

  const title = target.displayName || `@${target.handle}`;

  return (
    <main className="min-h-screen bg-[#0d0c0b] px-4 py-10 text-[#f4efe4] sm:py-16">
      <div className="mx-auto w-full max-w-md space-y-6">
        <header className="flex flex-col items-center gap-3 text-center">
          <UserAvatar
            src={target.avatarUrl}
            name={title}
            className="h-20 w-20 ring-1 ring-[#f4efe4]/15"
          />
          <div className="flex items-center gap-1.5">
            <h1 className="text-xl font-medium tracking-tight">{title}</h1>
            {target.verified && target.badgeVisible && (
              <ProfileBadge
                type={target.badgeType as BadgeType}
                legalName={target.legalName}
                nameFormat={target.badgeNameFormat as BadgeNameFormat}
                size="sm"
              />
            )}
          </div>
          {target.tagline && <p className="text-sm text-[#f4efe4]/60">{target.tagline}</p>}
        </header>

        {paid ? (
          <section className="rounded-3xl border border-[#f4efe4]/12 bg-[#161412] p-8 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-400" />
            <h2 className="text-lg font-medium">Bedankt voor je steun</h2>
            <p className="mt-1 text-sm text-[#f4efe4]/60">Je bijdrage is onderweg naar {title}.</p>
          </section>
        ) : (
          <section className="space-y-5 rounded-3xl border border-[#f4efe4]/12 bg-[#161412] p-5 sm:p-6">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-[#f4efe4]/50">Bedrag</Label>
              <div className="grid grid-cols-4 gap-2">
                {PRESETS.map((cents) => (
                  <button
                    key={cents}
                    type="button"
                    onClick={() => {
                      setAmount(cents);
                      setCustom("");
                    }}
                    className={cn(
                      "h-11 rounded-full border text-sm font-medium transition-colors",
                      !custom && amount === cents
                        ? "border-[#c9a227] bg-[#c9a227]/15 text-[#f4efe4]"
                        : "border-[#f4efe4]/15 text-[#f4efe4]/70 hover:border-[#f4efe4]/35",
                    )}
                  >
                    €{cents / 100}
                  </button>
                ))}
              </div>
              <Input
                inputMode="decimal"
                placeholder="Ander bedrag (€)"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                className="h-11 border-[#f4efe4]/15 bg-transparent text-[#f4efe4] placeholder:text-[#f4efe4]/35"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-[#f4efe4]/50">
                Bericht (optioneel)
              </Label>
              <Textarea
                rows={3}
                maxLength={500}
                placeholder="Laat een bericht achter…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="resize-none border-[#f4efe4]/15 bg-transparent text-[#f4efe4] placeholder:text-[#f4efe4]/35"
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                placeholder="Je naam (optioneel)"
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 border-[#f4efe4]/15 bg-transparent text-[#f4efe4] placeholder:text-[#f4efe4]/35"
              />
              <Input
                type="email"
                placeholder="E-mail (voor je bewijs)"
                maxLength={200}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 border-[#f4efe4]/15 bg-transparent text-[#f4efe4] placeholder:text-[#f4efe4]/35"
              />
            </div>

            <Altcha />

            <Button
              onClick={() => void submit()}
              disabled={submitting}
              className="h-12 w-full gap-2 rounded-full bg-[#c9a227] text-[#141210] hover:bg-[#d9b23b]"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <HeartHandshake className="h-4 w-4" />
              )}
              Steun {euro(effectiveCents)}
            </Button>
            <p className="text-center text-[11px] text-[#f4efe4]/40">
              Apple&nbsp;Pay · Google&nbsp;Pay · Bancontact · iDEAL · kaart — beveiligd via Stripe.
            </p>
            <p className="text-center text-[11px] leading-relaxed text-[#f4efe4]/35">
              ROUT faciliteert de directe verbinding met het betaalaccount van {title}. Eventuele
              fooien vallen onder de fiscale verantwoordelijkheid van de ontvanger.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
