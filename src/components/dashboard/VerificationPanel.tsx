import { BusinessInfluencerRequests } from "@/components/dashboard/BusinessInfluencerRequests";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, Check, CreditCard, Landmark, Loader2, Lock, QrCode, Tag } from "lucide-react";
import { notifyError, notifyInfo, notifySuccess } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { db } from "@/lib/db/client";
import { useAuth } from "@/hooks/useAuth";
import { DONATION_PLANS, euro, type DonationPlan } from "@/lib/profile";
import { clampContribution, contributionErrorKey, minContributionCents } from "@/lib/contributions";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { legalNameError } from "@/lib/legal-name";
import { VERIFIED_STRUCTURE_MESSAGE, verifiedHandleError } from "@/lib/verified-handle";
import {
  confirmCardPaymentIntent,
  resumeCardPaymentIntent,
  getPaymentConfig,
  getVerificationState,
  startCardPaymentIntent,
  startSepaVerification,
  startVerification,
} from "@/lib/verification.functions";

import { StripePaymentCard } from "@/components/dashboard/StripePaymentCard";
import { startBunqVerification, resumeBunqPayment } from "@/lib/bunq.functions";
import { useBunqPaymentPolling, type BunqTabRef } from "@/hooks/useBunqPaymentPolling";
import { usePaymentIntentPolling, type PaymentIntentRef } from "@/hooks/usePaymentIntentPolling";
import { usePaymentStatusPolling } from "@/hooks/usePaymentStatusPolling";
import { BunqPaymentCard } from "@/components/dashboard/BunqPaymentCard";
import { SepaTransferCard } from "@/components/dashboard/SepaTransferCard";
import { getBankTransferDetails, type BankTransferDetails } from "@/lib/bank-transfer.functions";
import { validatePromoCode } from "@/lib/promo.functions";
import { getReferralStats } from "@/lib/referral.functions";
import type { ReferralReward } from "@/lib/referral-rewards";
import {
  methodFeeCents,
  methodPriceCents,
  priceAfterPromo,
  type PromoDiscount,
} from "@/lib/checkout-pricing";
import { DEFAULT_PRICING, type PricingSettings } from "@/lib/pricing-settings";
import { getPricingSettings } from "@/lib/pricing.functions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ChevronsUpDown } from "lucide-react";
import { countryName, flagEmoji, sortedCountries } from "@/lib/countries";
import { currencyForCountry } from "@/lib/bunq-currency";
import { saveBillingCountry, getBillingCountry } from "@/lib/billing-country.functions";

type PaymentMethod = "stripe" | "sepa" | "bunq";

/** Accentkleur van de landenkiezer. */
const ACCENT = "#2563EB";

/** A dropped session surfaces as a 401 from the server function middleware. */
function isAuthFailure(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err);
  return /401|unauthorized|unauthenticated/i.test(text);
}

/** Payment states worth telling the user about, mapped to translation keys. */
const PAYMENT_NOTICES: Record<string, string | undefined> = {
  processing: "pay.status.processing",
  failed: "pay.status.failed",
  expired: "pay.status.expired",
  refunded: "pay.status.refunded",
};

/**
 * Benefits, each with the requirement that actually gates it in the backend.
 * `signup` benefits are live the moment an account exists (the Early Believer
 * badge is granted by the signup trigger), `payment` needs a confirmed Early
 * Believer payment, `verification` needs the identity check (blue check).
 */
const BENEFITS = [
  { key: "badge", requires: "signup" as const },
  { key: "blue", requires: "verification" as const },
  { key: "email", requires: "payment" as const },
  { key: "domain", requires: "payment" as const },
  { key: "price", requires: "payment" as const },
];

/**
 * Early Believer checkout — one-time €3.99 lifetime verification with an
 * optional recurring “Keep ROUT Alive” donation. Flat UI: solid colours,
 * crisp borders, no gradients.
 */
export function VerificationPanel() {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const start = useServerFn(startVerification);
  const startIntent = useServerFn(startCardPaymentIntent);
  // Embedded Stripe Elements checkout state (client secret + amount).
  const [cardIntent, setCardIntent] = useState<{
    clientSecret: string;
    intentId: string;
    paymentId: string;
    publishableKey: string;
    totalCents: number;
  } | null>(null);
  const confirmIntent = useServerFn(confirmCardPaymentIntent);
  const resumeIntent = useServerFn(resumeCardPaymentIntent);
  /** True zolang een 3DS-terugkeer wordt afgerond: geen nieuwe checkout. */
  const [resuming, setResuming] = useState(false);
  /** Intent die na een redirect nog asynchroon moet landen (Bancontact, iDEAL, Klarna). */
  const [pendingIntent, setPendingIntent] = useState<PaymentIntentRef | null>(null);
  const startSepa = useServerFn(startSepaVerification);

  const startBunq = useServerFn(startBunqVerification);
  const resumeBunq = useServerFn(resumeBunqPayment);

  const loadMemberState = useServerFn(getVerificationState);
  const loadPaymentConfig = useServerFn(getPaymentConfig);
  const loadPricing = useServerFn(getPricingSettings);

  // Terugkeer uit een 3DS-redirect (bankapp/issuer): de server verifieert de
  // uitkomst bij Stripe en de gebruiker krijgt meteen een duidelijke melding.
  // De bestaande PaymentIntent wordt hervat — nooit een tweede checkout.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isReturn =
      params.get("payment") === "return" ||
      params.has("payment_intent") ||
      params.has("redirect_status");
    if (!isReturn) return;
    // Stripe geeft na sommige redirects alleen `payment_intent` mee.
    const intentId = params.get("intent") ?? params.get("payment_intent");
    const paymentId = params.get("payment_id");
    const clean = () => {
      const url = new URL(window.location.href);
      [
        "payment",
        "intent",
        "payment_id",
        "payment_intent",
        "payment_intent_client_secret",
        "redirect_status",
      ].forEach((k) => url.searchParams.delete(k));
      window.history.replaceState({}, "", url.toString());
    };
    if (!intentId) {
      clean();
      return;
    }
    // Eén afhandeling per intent: React StrictMode en een terugnavigatie mogen
    // nooit twee keer bevestigen (en dus nooit een dubbele checkout starten).
    const guardKey = `rout.pay-return.${intentId}`;
    try {
      if (window.sessionStorage.getItem(guardKey)) {
        clean();
        return;
      }
      window.sessionStorage.setItem(guardKey, "1");
    } catch {
      /* private mode — de in-flight guard hieronder blijft gelden */
    }
    setResuming(true);
    void (async () => {
      try {
        // Met payment_id bevestigen we direct; zonder zoekt de server de
        // bijhorende betaling op via de intent-metadata.
        const res = paymentId
          ? await confirmIntent({ data: { intentId, paymentId } })
          : await resumeIntent({ data: { intentId } });
        const resolvedPaymentId =
          paymentId ?? ("paymentId" in res ? (res.paymentId as string | undefined) : undefined);
        if (res.ok && res.status === "succeeded") {
          notifySuccess(t("pay.card.paid"));
          setReloadKey((k) => k + 1);
        } else if (res.ok && res.status === "processing") {
          // Nog niet afgerond: het trage pollingschema volgt de status op en
          // schakelt automatisch naar succes zodra de betaling binnen is.
          notifyInfo(t("pay.status.processing"));
          if (resolvedPaymentId) setPendingIntent({ intentId, paymentId: resolvedPaymentId });
        } else if (!res.ok && res.reason === "requires_action") {
          notifyInfo(t("pay.status.processing"));
          if (resolvedPaymentId) setPendingIntent({ intentId, paymentId: resolvedPaymentId });
        } else if (!res.ok && res.reason === "stripe_unavailable") {
          // Tijdelijke storing: de guard weer vrijgeven zodat een refresh de
          // afronding opnieuw mag proberen.
          try {
            window.sessionStorage.removeItem(guardKey);
          } catch {
            /* geen opslag beschikbaar */
          }
          notifyError(t("pay.err.generic"));
        } else notifyError(t("pay.status.failed"));
      } catch {
        try {
          window.sessionStorage.removeItem(guardKey);
        } catch {
          /* geen opslag beschikbaar */
        }
        notifyError(t("pay.err.generic"));
      } finally {
        setResuming(false);
        clean();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tarieven komen uit het adminportaal; defaults tot ze geladen zijn.
  const [pricing, setPricing] = useState<PricingSettings>(DEFAULT_PRICING);
  // `null` = still unknown; the card option stays enabled until we know better.
  const [stripeReady, setStripeReady] = useState<boolean | null>(null);
  const [state, setState] = useState<{
    tier: string;
    verified: boolean;
    isEarlyBeliever: boolean;
    isPaid: boolean;
  } | null>(null);
  const [payment, setPayment] = useState<{ status: string; at: string } | null>(null);
  // The benefits grid must never sit on stale/blank data silently: it either
  // loads, shows the real status, or explains the failure with a retry.
  const [statusState, setStatusState] = useState<"loading" | "ready" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showSepa, setShowSepa] = useState(false);
  const [sepaRef, setSepaRef] = useState<string | null>(null);
  const [sepaTotalCents, setSepaTotalCents] = useState<number | null>(null);
  // bunq: `null` = nog onbekend; de optie blijft aan tot de config anders zegt.
  const [bunqReady, setBunqReady] = useState<boolean | null>(null);
  const [showBunq, setShowBunq] = useState(false);
  const [bunqUrl, setBunqUrl] = useState<string | null>(null);
  const [bunqRef, setBunqRef] = useState<string | null>(null);
  const [bunqTotalCents, setBunqTotalCents] = useState<number | null>(null);
  /** Index in de roterende status-teksten van het laadscherm. */
  const [bunqStep, setBunqStep] = useState(0);
  /** Tab + betaling van deze checkout-sessie, voedt de live statuspolling. */
  const [bunqTab, setBunqTab] = useState<BunqTabRef | null>(null);

  const [handle, setHandle] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("stripe");
  const [country, setCountry] = useState("BE");
  const [plan, setPlan] = useState<DonationPlan>("none");
  const [customCents, setCustomCents] = useState<number | null>(null);
  const [nameOpen, setNameOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  /** Wat we opslaan als `full_name`: voornaam + achternaam. */
  const legalName = `${firstName.trim()} ${lastName.trim()}`.trim();

  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<PromoDiscount | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [referralReward, setReferralReward] = useState<ReferralReward | null>(null);
  const loadReferralStats = useServerFn(getReferralStats);
  const checkPromo = useServerFn(validatePromoCode);
  const loadBankDetails = useServerFn(getBankTransferDetails);
  const persistCountry = useServerFn(saveBillingCountry);
  const loadSavedCountry = useServerFn(getBillingCountry);
  const [bank, setBank] = useState<BankTransferDetails | null>(null);
  const [bankState, setBankState] = useState<"loading" | "ok" | "unavailable" | "bunqme">(
    "loading",
  );
  /** Dynamische bunq.me-link wanneer er geen lokale rekening bestaat. */
  const [bunqmeUrl, setBunqmeUrl] = useState<string | null>(null);
  /** Valuta van het gekozen land (voor de EUR-omrekeningsmelding). */
  const [countryOpen, setCountryOpen] = useState(false);
  const countryCurrency = currencyForCountry(country);
  const countryOptions = sortedCountries(locale);

  /** Landkeuze bewaren: lokaal én op het profiel. */
  const chooseCountry = (code: string) => {
    setCountry(code);
    setCountryOpen(false);
    try {
      window.localStorage.setItem("rout.billing-country", code);
    } catch {
      /* private mode — de keuze blijft alleen in deze sessie */
    }
    void persistCountry({ data: { country: code } }).catch(() => {
      /* profielopslag is best-effort; de checkout gaat gewoon door */
    });
  };

  // Landkeuze wordt na hydratie gelezen (nooit tijdens render/SSR): eerst
  // localStorage, daarna het opgeslagen profielland als dat er is.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("rout.billing-country");
      if (saved) setCountry(saved);
    } catch {
      /* geen opslag beschikbaar */
    }
    let cancelled = false;
    void loadSavedCountry()
      .then((res) => {
        if (!cancelled && res.country) setCountry(res.country);
      })
      .catch(() => {
        /* geen profielland bekend */
      });
    return () => {
      cancelled = true;
    };
  }, [loadSavedCountry]);

  useEffect(() => {
    let cancelled = false;
    void loadReferralStats()
      .then((stats) => {
        if (!cancelled) setReferralReward(stats.reward);
      })
      .catch(() => {
        /* geen beloning zichtbaar — de prijs blijft de standaardprijs */
      });
    return () => {
      cancelled = true;
    };
  }, [loadReferralStats]);

  useEffect(() => {
    let cancelled = false;
    void loadPricing()
      .then((value) => {
        if (!cancelled && value) setPricing(value);
      })
      .catch(() => {
        /* defaults blijven staan */
      });
    return () => {
      cancelled = true;
    };
  }, [loadPricing]);

  const cardUnavailable = stripeReady === false;

  const planInterval = DONATION_PLANS.find((p) => p.id === plan)?.interval ?? null;
  const planCents =
    plan === "none" ? 0 : (customCents ?? minContributionCents(plan, pricing.minDonationCents));
  const planErrorKey = plan === "none" ? null : contributionErrorKey(plan, planCents);
  const planError = planErrorKey ? t(planErrorKey.key, planErrorKey.params) : null;
  // Only a monthly plan is charged together with the one-time fee today.
  const todayCents = planCents;
  // The CTA must always mirror “Total today”, whichever method is selected.
  // On the manual SEPA route a recurring donation becomes a single one-off
  // contribution inside the same transfer.
  // De betaalmethode bepaalt de basisprijs: SEPA €3,99 (handmatig verwerkt),
  // kaart €13,99 (direct actief). Een promocode gaat daar rechtstreeks van af.
  // bunq rekent als bankroute (SEPA-prijs €3,99): geen kaartkosten.
  const checkoutMethod =
    method === "sepa"
      ? ("sepa" as const)
      : method === "bunq"
        ? ("bunq" as const)
        : ("card" as const);
  const baseCents = methodPriceCents(checkoutMethod, pricing);
  const feeCents = methodFeeCents(checkoutMethod, pricing);
  // De server rekent met de laagste van promocode en referral-beloning; de UI
  // laat exact hetzelfde bedrag zien.
  const referralPriceCents = Math.max(
    0,
    baseCents - Math.round((baseCents * (referralReward?.percentOff ?? 0)) / 100),
  );
  const discountedBaseCents = Math.min(
    priceAfterPromo(checkoutMethod, promo, pricing),
    referralPriceCents,
  );
  const promoSavingCents = baseCents - discountedBaseCents;
  const totalTodayCents = discountedBaseCents + todayCents;
  const isFreeCheckout = totalTodayCents === 0;
  /** Referentie die zowel de overschrijving als het bunq.me-verzoek draagt. */
  const transferReference = sepaRef ?? `ROUT-${(handle || "handle").toUpperCase()}`;
  const transferAmountCents = sepaTotalCents ?? totalTodayCents;

  // Bankgegevens zijn land-/valuta-specifiek: bij elke landwissel opnieuw de
  // juiste bunq-subrekening opvragen zolang "Overschrijving" gekozen is.
  useEffect(() => {
    if (method !== "sepa") return;
    let cancelled = false;
    setBankState("loading");
    void loadBankDetails({
      data: {
        country,
        reference: transferReference,
      },
    })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setBank(result.details);
          setBunqmeUrl(null);
          setBankState("ok");
        } else if (result.reason === "bunqme" && result.bunqme?.shareUrl) {
          setBank(null);
          setBunqmeUrl(result.bunqme.shareUrl);
          setBankState("bunqme");
        } else {
          setBank(null);
          setBunqmeUrl(null);
          setBankState(
            result.reason === "no_local_account" || result.reason === "bunqme"
              ? "unavailable"
              : "ok",
          );
        }
      })
      .catch(() => {
        if (cancelled) return;
        setBank(null);
        setBunqmeUrl(null);
        setBankState("ok");
      });
    return () => {
      cancelled = true;
    };
  }, [country, method, loadBankDetails, transferAmountCents, transferReference]);

  const applyPromo = async () => {
    const code = promoInput.trim();
    if (!code) return;
    setPromoBusy(true);
    setPromoError(null);
    try {
      const res = await checkPromo({ data: { code } });
      if (res.ok) {
        setPromo(res.promo);
        notifySuccess(`Code toegepast: ${res.promo.label}`);
      } else {
        setPromo(null);
        setPromoError("Deze code is niet geldig.");
      }
    } catch {
      setPromoError("Kon de code niet controleren. Probeer het opnieuw.");
    } finally {
      setPromoBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cfg = await loadPaymentConfig();
        if (!cancelled) {
          setStripeReady(cfg.stripeReady);
          setBunqReady(cfg.bunqReady);
          // Never park the user on a route this deployment cannot complete.
          if (!cfg.stripeReady) setMethod(cfg.bunqReady ? "bunq" : "sepa");
        }
      } catch {
        if (!cancelled) setStripeReady(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPaymentConfig]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      try {
        const data = await loadMemberState();
        if (cancelled) return;
        setHandle(data.username ?? "");
        setState({
          tier: data.tier,
          verified: data.verified,
          isEarlyBeliever: data.isEarlyBeliever,
          isPaid: data.isPaid,
        });
        setStatusState("ready");
      } catch (error) {
        if (cancelled) return;
        console.error("member status load failed", error);
        setStatusState("error");
      }
    };

    const loadPayment = async () => {
      const { data } = await db
        .from("verification_payments")
        .select("status, updated_at, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setPayment(
        data
          ? { status: String(data.status), at: (data.updated_at ?? data.created_at) as string }
          : null,
      );
    };

    setStatusState("loading");
    void load();
    void loadPayment();

    // A manual admin approval must flip this panel without a page refresh.
    const channel = db
      .channel(`profile-status-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
        () => void load(),
      )
      // Stripe webhooks write here first: a clearing SEPA debit or a failed
      // charge must surface without the user reloading the dashboard.
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "verification_payments",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void loadPayment();
          void load();
        },
      )
      // A badge grant (signup, payment, admin) must light the card up too.
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_badges", filter: `user_id=eq.${user.id}` },
        () => void load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      void db.removeChannel(channel);
    };
  }, [user, reloadKey, loadMemberState]);

  // Geverifieerde leden hoeven de aankoopkaart nooit meer te zien; zij krijgen
  // een verwijzing naar het donatieportaal om alsnog bij te dragen.
  const active = Boolean(state?.isEarlyBeliever || state?.isPaid || state?.verified);

  /**
   * Asynchrone betalingen (Bancontact/iDEAL-redirect, QR, overschrijving)
   * bevestigen buiten de browser om. Zolang er een open betaling of een
   * lopende checkout is, verzoent de server elke paar seconden de echte status
   * bij Stripe — die activeert en mailt; hier ververst enkel het scherm.
   */
  const openPayment = Boolean(
    payment && ["pending", "processing", "incomplete", "requires_action"].includes(payment.status),
  );
  const checkoutOpen = Boolean(cardIntent || showSepa || showBunq);
  const livePayment = usePaymentStatusPolling(
    Boolean(user) && !active && (openPayment || checkoutOpen),
    () => {
      setReloadKey((k) => k + 1);
      notifySuccess(t("pay.card.paid"));
    },
  );

  useEffect(() => {
    if (!livePayment.status || !livePayment.at) return;
    setPayment((prev) =>
      prev && prev.status === livePayment.status && prev.at === livePayment.at
        ? prev
        : { status: livePayment.status as string, at: livePayment.at as string },
    );
  }, [livePayment.status, livePayment.at]);

  /**
   * Kaartroute: embedded Stripe Elements op rout.be zelf. Alleen een
   * terugkerende donatie valt terug op de gehoste abonnementsflow.
   */
  const upgrade = async () => {
    if (!user) {
      notifyError(t("pay.err.signin"));
      return;
    }
    setBusy(true);
    try {
      const clientRequestId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `rout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const res = await startIntent({
        data: {
          donationPlan: plan,
          donationCents: clampContribution(plan, planCents),
          legalName,
          clientRequestId,
          ...(promo ? { promoCode: promo.code } : {}),
        },
      });
      if (res.ok) {
        setNameOpen(false);
        if (res.free) {
          window.location.href = `${window.location.origin}/dashboard?verification=success`;
          return;
        }
        setCardIntent({
          clientSecret: res.clientSecret,
          intentId: res.intentId,
          paymentId: res.paymentId,
          publishableKey: res.publishableKey,
          totalCents: res.totalCents,
        });
        return;
      }
      if (res.reason === "recurring_requires_redirect") {
        await hostedUpgrade();
        return;
      }
      if (res.reason === "email_unconfirmed") notifyError(t("pay.err.email"));
      else if (res.reason === "stripe_not_configured") {
        setStripeReady(false);
        setMethod("sepa");
        notifyInfo(t("pay.err.stripe"));
      } else if (res.reason === "checkout_failed") notifyError(t("pay.err.checkout"));
      else notifyError(t("pay.err.generic"));
    } catch (err) {
      console.error("[pay] start card payment failed", err);
      notifyError(isAuthFailure(err) ? t("pay.err.signin") : t("pay.err.generic"));
    } finally {
      setBusy(false);
    }
  };

  /** Gehoste Stripe Checkout — enkel nog voor terugkerende donaties. */
  const hostedUpgrade = async () => {
    try {
      const res = await start({
        data: {
          origin: window.location.origin,
          paymentMethod: "card",
          donationPlan: plan,
          donationCents: clampContribution(plan, planCents),
          legalName,
          ...(promo ? { promoCode: promo.code } : {}),
        },
      });
      if (res.ok) {
        window.location.href = res.url;
        return;
      }
      if (res.reason === "email_unconfirmed") notifyError(t("pay.err.email"));
      else if (res.reason === "stripe_not_configured") {
        setStripeReady(false);
        setMethod("sepa");
        notifyInfo(t("pay.err.stripe"));
      } else if (res.reason === "checkout_failed") notifyError(t("pay.err.checkout"));
      else notifyError(t("pay.err.generic"));
    } catch (err) {
      console.error("[pay] hosted checkout failed", err);
      notifyError(isAuthFailure(err) ? t("pay.err.signin") : t("pay.err.generic"));
    }
  };

  /** SEPA route: the legal name is mandatory here too. */
  const requestSepa = async () => {
    if (!user) {
      notifyError(t("pay.err.signin"));
      return;
    }
    setBusy(true);
    try {
      const res = await startSepa({
        data: {
          donationPlan: plan,
          donationCents: clampContribution(plan, planCents),
          legalName,
          ...(promo ? { promoCode: promo.code } : {}),
        },
      });
      if (res.ok) {
        setSepaRef(res.reference ?? null);
        setSepaTotalCents(res.totalCents ?? null);
        setShowSepa(true);
        setNameOpen(false);
      } else if ("reason" in res && res.reason === "email_unconfirmed") {
        notifyError(t("pay.err.email"));
      } else {
        notifyError(t("pay.err.sepa"));
      }
    } catch (err) {
      console.error("[pay] start sepa failed", err);
      notifyError(isAuthFailure(err) ? t("pay.err.signin") : t("pay.err.sepa"));
    } finally {
      setBusy(false);
    }
  };

  /**
   * bunq-route: met roterende status-teksten in het laadscherm terwijl de
   * server installation → session → bunq.me-tab doorloopt. Elke betaling loopt
   * via bunq — bij een fout tonen we een nette melding, geen IBAN-fallback.
   */
  const requestBunq = async () => {
    if (!user) {
      notifyError(t("pay.err.signin"));
      return;
    }
    setBusy(true);
    setBunqStep(0);
    const stepTimer = window.setInterval(() => setBunqStep((s) => Math.min(s + 1, 3)), 1400);
    try {
      // Eén idempotency-sleutel per checkout-poging: nooit twee bunq-tabs.
      const clientRequestId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `rout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const res = await startBunq({
        data: {
          country,
          clientRequestId,
          donationPlan: plan,
          donationCents: clampContribution(plan, planCents),
          legalName,
          ...(promo ? { promoCode: promo.code } : {}),
        },
      });
      if (res.ok) {
        setNameOpen(false);
        if (res.free) {
          window.location.href = `${window.location.origin}/dashboard?verification=success`;
          return;
        }
        setBunqUrl(res.shareUrl ?? null);
        setBunqRef(res.reference ?? null);
        setBunqTotalCents(res.totalCents ?? null);
        // Live betaalstatus: start het pollen zodra de tab bestaat.
        setBunqTab(
          res.tabId && res.accountId && res.paymentId
            ? { tabId: res.tabId, accountId: res.accountId, paymentId: res.paymentId }
            : null,
        );
        setShowBunq(true);
      } else if (res.reason === "bunq_request_failed" || res.reason === "bunq_not_configured") {
        notifyError(t("pay.err.bunq"));
      } else if (res.reason === "email_unconfirmed") {
        notifyError(t("pay.err.email"));
      } else {
        notifyError(t("pay.err.bunq"));
      }
    } catch (err) {
      console.error("[pay] start bunq failed", err);
      notifyError(isAuthFailure(err) ? t("pay.err.signin") : t("pay.err.bunq"));
    } finally {
      window.clearInterval(stepTimer);
      setBunqStep(0);
      setBusy(false);
    }
  };

  /**
   * Live betaalstatus: pollt bunq elke 3 seconden zolang het verzoek open
   * staat. De server activeert de verificatie en stuurt de bevestigingsmail;
   * hier verversen we alleen de zichtbare status.
   */
  // Asynchrone Stripe-betaling na redirect: pollt volgens het aflopende schema
  // en toont het succes-scherm zodra Stripe of de webhook bevestigt.
  usePaymentIntentPolling(
    pendingIntent,
    () => {
      setPendingIntent(null);
      setCardIntent(null);
      setReloadKey((k) => k + 1);
      notifySuccess(t("pay.card.paid"));
    },
    () => {
      setPendingIntent(null);
      notifyError(t("pay.status.failed"));
    },
  );

  const { status: bunqPollStatus, retry: retryBunqPoll } = useBunqPaymentPolling(bunqTab, () => {
    setBunqTab(null);
    setReloadKey((k) => k + 1);
    notifySuccess(t("pay.bunq.paid"));
  });

  /**
   * State persistence: bij het openen van de pagina (of na een refresh) halen we
   * de openstaande pending bunq-betaling uit de database terug en zetten we de
   * QR + polling meteen weer aan. Het betaalvenster verdwijnt dus nooit.
   */
  useEffect(() => {
    if (active) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await resumeBunq();
        if (cancelled || !res.ok) return;
        if ("paid" in res && res.paid) {
          setReloadKey((k) => k + 1);
          return;
        }
        if (!res.open) return;
        setMethod("bunq");
        setBunqUrl(res.shareUrl);
        setBunqRef(res.reference ?? null);
        setBunqTotalCents(res.totalCents);
        setBunqTab({
          tabId: res.tabId,
          accountId: res.accountId,
          paymentId: res.paymentId,
        });
        setShowBunq(true);
      } catch {
        /* niet ingelogd of tijdelijke fout: de gewone checkout blijft werken */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">
          {active ? t("eb.titleActive") : t("eb.title")}
        </h2>
        {active && (
          <span className="inline-flex items-center gap-1.5 border border-primary bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide">
            <BadgeCheck className="h-3.5 w-3.5" /> {t("eb.badge")}
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Verified profiles live at{" "}
        <strong className="font-mono">rout.be/@{handle || "handle"}</strong>. Free profiles stay at{" "}
        <strong className="font-mono">rout.be/u/@{handle || "handle"}</strong>. Verification only
        becomes active once your payment is confirmed.
      </p>

      {/* Live payment state, driven by the Stripe webhook via realtime. */}
      {payment && !active && PAYMENT_NOTICES[payment.status] && (
        <p
          role="status"
          className={`rounded-xl border p-3 text-xs ${
            payment.status === "processing"
              ? "border-border bg-muted/50 text-muted-foreground"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          {t(PAYMENT_NOTICES[payment.status]!)}{" "}
          <span className="opacity-70">({formatDateTime(payment.at, locale)})</span>
        </p>
      )}

      {/* Benefit cards — each shows whether it is live for this account today. */}
      {statusState === "loading" && (
        <ul className="grid gap-2 sm:grid-cols-2" aria-busy>
          {BENEFITS.map((b) => (
            <li key={b.key} className="rounded-xl border border-border bg-muted/30 p-3">
              <div className="h-3 w-24 animate-pulse rounded bg-muted-foreground/20" />
              <div className="mt-2 h-2.5 w-full animate-pulse rounded bg-muted-foreground/10" />
              <div className="mt-2 h-3 w-16 animate-pulse rounded bg-muted-foreground/10" />
            </li>
          ))}
        </ul>
      )}

      {statusState === "error" && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm font-semibold">{t("benefits.error.title")}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{t("benefits.error.desc")}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 h-8 text-xs"
            onClick={() => setReloadKey((k) => k + 1)}
          >
            {t("benefits.error.retry")}
          </Button>
        </div>
      )}

      <ul className={`grid gap-2 sm:grid-cols-2 ${statusState === "ready" ? "" : "hidden"}`}>
        {BENEFITS.map((b) => {
          const unlocked =
            b.requires === "signup" ||
            (b.requires === "verification" ? Boolean(state?.verified) : active);
          const statusKey = unlocked
            ? b.requires === "signup"
              ? "benefits.status.now"
              : "benefits.status.unlocked"
            : b.requires === "verification"
              ? "benefits.status.verification"
              : "benefits.status.payment";
          const Icon = b.key === "blue" ? BadgeCheck : unlocked ? Check : Lock;
          return (
            <li
              key={b.key}
              className={`rounded-xl border p-3 ${
                unlocked ? "border-foreground/25 bg-background" : "border-border bg-muted/30"
              }`}
            >
              <div className="flex items-start gap-2">
                <Icon
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    unlocked ? "text-foreground" : "text-muted-foreground"
                  }`}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{t(`benefits.${b.key}.title`)}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {t(`benefits.${b.key}.desc`)}
                  </p>
                  <span
                    className={`mt-1.5 inline-block border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      unlocked
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {t(statusKey)}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {active && (
        <div className="rounded-xl border border-border p-4">
          <p className="text-sm font-medium">Je verificatie is actief</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Wil je ROUT alsnog steunen? Dat kan altijd via het donatieportaal — vrijblijvend en
            zonder invloed op je verificatie.
          </p>
          <a
            href="/info/tips"
            className="mt-3 inline-flex h-9 items-center rounded-xl bg-foreground px-3 text-xs font-medium text-background transition-opacity hover:opacity-90"
          >
            Lees over fooien en steun
          </a>
        </div>
      )}

      {!active && (
        <div className="overflow-hidden rounded-xl border border-border">
          {/* Line item */}
          <div className="flex items-baseline justify-between gap-3 border-b border-border p-4">
            <div>
              <p className="text-sm font-semibold">{t("eb.lineItem")}</p>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {method === "sepa"
                  ? "Handmatige verwerking (1–3 werkdagen) — geen transactiekosten"
                  : "Direct actief (instant activatie)"}
              </p>
            </div>
            <span className="text-2xl font-bold tabular-nums" data-testid="checkout-price">
              {euro(baseCents)}
            </span>
          </div>

          {/* Donation selector */}
          <fieldset className="border-b border-border p-4">
            <legend className="sr-only">{t("contrib.legend")}</legend>
            <p className="mb-2 text-xs font-semibold">{t("contrib.title")}</p>
            <div
              className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
              role="radiogroup"
              aria-label={t("contrib.legend")}
            >
              {DONATION_PLANS.map((p) => {
                const selected = plan === p.id;
                return (
                  <label
                    key={p.id}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-[11px] transition-colors ${
                      selected
                        ? "border-foreground bg-muted"
                        : "border-border hover:border-foreground/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="donation-plan"
                      className="mt-0.5 h-3.5 w-3.5 shrink-0"
                      checked={selected}
                      onChange={() => {
                        setPlan(p.id);
                        setCustomCents(null);
                      }}
                    />
                    <span>
                      <span className="block font-semibold text-foreground">
                        {t(`contrib.plan.${p.id}`)}
                      </span>
                      <span className="block text-muted-foreground">
                        {t(`contrib.plan.${p.id}.note`)}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            {plan !== "none" && (
              <div className="mt-3 space-y-1.5">
                <Label htmlFor="contribution" className="text-[11px] font-semibold">
                  {t(
                    plan === "one_time"
                      ? "checkout.donation.one_time_label"
                      : planInterval === "month"
                        ? "contrib.amount.month"
                        : "contrib.amount.year",
                    { min: euro(minContributionCents(plan, pricing.minDonationCents)) },
                  )}
                </Label>
                <Input
                  id="contribution"
                  type="number"
                  min={minContributionCents(plan, pricing.minDonationCents) / 100}
                  step="0.5"
                  value={(planCents / 100).toString()}
                  onChange={(e) =>
                    setCustomCents(
                      e.target.value === "" ? null : Math.round(Number(e.target.value) * 100),
                    )
                  }
                  className="input-field h-10 w-40 rounded-xl"
                />
                {planError && <p className="text-[11px] text-destructive">{planError}</p>}
              </div>
            )}
          </fieldset>

          {/* Payment method */}
          <div
            className="grid gap-2 border-b border-border p-4 sm:grid-cols-3"
            role="radiogroup"
            aria-label={t("pay.method")}
          >
            {[
              {
                id: "stripe" as const,
                icon: CreditCard,
                label: t("pay.card"),
                note: t("checkout.method.card_sub", {
                  fee: euro(methodFeeCents("card", pricing)),
                }),
              },
              {
                id: "bunq" as const,
                icon: QrCode,
                label: t("pay.bunq"),
                note: t("checkout.method.bunq_sub", {
                  fee: euro(methodFeeCents("bunq", pricing)),
                }),
              },
              {
                id: "sepa" as const,
                icon: Landmark,
                label: t("pay.sepa"),
                note:
                  methodFeeCents("sepa", pricing) === 0
                    ? t("checkout.method.sepa_sub", { fee: t("checkout.fee.free") })
                    : t("checkout.method.sepa_sub", {
                        fee: euro(methodFeeCents("sepa", pricing)),
                      }),
              },
            ].map(({ id, icon: Icon, label, note }) => {
              const selected = method === id;
              const disabled =
                (id === "stripe" && cardUnavailable) || (id === "bunq" && bunqReady === false);
              return (
                <label
                  key={id}
                  className={`flex items-center gap-2 rounded-lg border p-3 text-[11px] transition-colors ${
                    disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                  } ${
                    selected
                      ? "border-foreground bg-muted"
                      : disabled
                        ? "border-border bg-muted/30"
                        : "border-border hover:border-foreground/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="payment-method"
                    className="h-3.5 w-3.5"
                    checked={selected}
                    disabled={disabled}
                    onChange={() => {
                      if (!disabled) setMethod(id);
                    }}
                  />
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    <span className="block font-semibold text-foreground">{label}</span>
                    <span className="block text-muted-foreground">
                      {disabled ? t("pay.card.unavailable") : note}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          {/* Summary + CTA */}
          <div className="space-y-3 p-4">
            {/* Land van de betaler — doorzoekbaar, wereldwijd. De afrekening
                blijft in euro via de centrale SEPA-rekening. */}
            <div className="space-y-1.5">
              <Label htmlFor="billing-country" className="text-[11px] font-semibold">
                Land
              </Label>
              <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                <PopoverTrigger asChild>
                  <button
                    id="billing-country"
                    type="button"
                    role="combobox"
                    aria-expanded={countryOpen}
                    aria-controls="billing-country-options"
                    className="input-field flex h-9 w-full items-center justify-between gap-2 rounded-xl bg-background px-2 text-xs"
                    style={countryOpen ? { borderColor: ACCENT, color: ACCENT } : undefined}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span aria-hidden>{flagEmoji(country)}</span>
                      <span className="truncate">{countryName(country, locale)}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{country}</span>
                    </span>
                    <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[min(20rem,90vw)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder={t("checkout.search_country_placeholder")} />
                    <CommandList id="billing-country-options">
                      <CommandEmpty>—</CommandEmpty>
                      <CommandGroup>
                        {countryOptions.map((c) => {
                          const selected = c.code === country;
                          return (
                            <CommandItem
                              key={c.code}
                              value={`${countryName(c.code, locale)} ${c.code} ${c.currency}`}
                              onSelect={() => chooseCountry(c.code)}
                              className="gap-2 text-xs"
                            >
                              <span aria-hidden>{flagEmoji(c.code)}</span>
                              <span className="flex-1 truncate">{countryName(c.code, locale)}</span>
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {c.code}
                              </span>
                              {selected && (
                                <Check
                                  className="h-3.5 w-3.5"
                                  style={{ color: ACCENT }}
                                  aria-hidden
                                />
                              )}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {countryCurrency === "EUR" ? (
                <p className="text-[11px] text-muted-foreground">
                  Alle betalingen verlopen in euro (€) via één centrale SEPA-rekening — binnen de
                  SEPA-zone zonder extra kosten.
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  De afrekening vindt plaats in euro ({euro(totalTodayCents)}). Jouw bank verzorgt
                  de omrekening van {countryCurrency} naar EUR tegen haar eigen wisselkoers.
                </p>
              )}
            </div>

            {/* Promocode */}
            <div className="space-y-1.5">
              <Label htmlFor="promo-code" className="text-[11px] font-semibold">
                Promocode
              </Label>
              <div className="flex gap-2">
                <Input
                  id="promo-code"
                  value={promoInput}
                  placeholder="Kortingscode"
                  autoComplete="off"
                  onChange={(e) => {
                    setPromoInput(e.target.value);
                    setPromoError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void applyPromo();
                    }
                  }}
                  className="input-field h-9 flex-1 rounded-xl text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-xl px-3 text-xs font-semibold"
                  disabled={promoBusy || promoInput.trim() === ""}
                  onClick={() => void applyPromo()}
                >
                  {promoBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Toepassen"}
                </Button>
              </div>
              {promoError && <p className="text-[11px] text-destructive">{promoError}</p>}
              {promo && (
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  Code toegepast: {promo.label}
                  <button
                    type="button"
                    className="ml-1 font-normal text-muted-foreground underline"
                    onClick={() => {
                      setPromo(null);
                      setPromoInput("");
                    }}
                  >
                    verwijderen
                  </button>
                </p>
              )}
            </div>

            <dl className="space-y-1 text-xs">
              <div className="flex justify-between">
                <dt>{t("contrib.line.oneTime")}</dt>
                <dd className="tabular-nums">{euro(pricing.baseCents)}</dd>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <dt>{t("checkout.fee.line")}</dt>
                <dd className="tabular-nums">
                  {feeCents === 0 ? t("checkout.fee.free") : `+${euro(feeCents)}`}
                </dd>
              </div>
              {promo && promoSavingCents > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                  <dt>Promocode {promo.code}</dt>
                  <dd className="tabular-nums">−{euro(promoSavingCents)}</dd>
                </div>
              )}
              {planCents > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <dt>
                    {plan === "one_time"
                      ? t("checkout.donation.one_time")
                      : method === "sepa"
                        ? "Donation (one-off via transfer)"
                        : t(
                            planInterval === "month"
                              ? "contrib.line.monthly"
                              : "contrib.line.yearly",
                          )}
                  </dt>
                  <dd className="tabular-nums">
                    {euro(planCents)}
                    {method === "sepa" || plan === "one_time"
                      ? ""
                      : ` / ${t(planInterval === "month" ? "contrib.per.month" : "contrib.per.year")}`}
                  </dd>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-1 text-sm font-bold">
                <dt>{t("contrib.total")}</dt>
                <dd className="tabular-nums" data-testid="total-today">
                  {euro(totalTodayCents)}
                </dd>
              </div>
            </dl>

            {method !== "stripe" && planCents > 0 && plan !== "one_time" && (
              <p className="rounded-lg border border-border bg-muted/50 p-2 text-[11px] text-muted-foreground">
                A recurring donation can't be collected over a manual bank transfer. Your{" "}
                {euro(planCents)} is included once in this transfer; switch to the card route for a
                recurring “Keep ROUT Alive” donation.
              </p>
            )}

            {method === "stripe" ? (
              <Button
                className="h-11 w-full rounded-xl text-sm font-semibold"
                disabled={busy || resuming || cardUnavailable || Boolean(planError)}
                onClick={() => setNameOpen(true)}
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isFreeCheckout
                  ? "Verificatie activeren"
                  : `Kaart · Apple Pay — ${euro(totalTodayCents)}`}
              </Button>
            ) : method === "bunq" ? (
              <Button
                className="h-11 w-full rounded-xl text-sm font-semibold"
                disabled={busy || resuming || bunqReady === false || Boolean(planError)}
                onClick={() => {
                  if (showBunq) {
                    setShowBunq(false);
                    return;
                  }
                  setNameOpen(true);
                }}
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {showBunq
                  ? t("pay.cta.hide")
                  : isFreeCheckout
                    ? "Verificatie activeren"
                    : t("pay.bunq.cta", { total: euro(totalTodayCents) })}
              </Button>
            ) : (
              <Button
                variant="outline"
                className="h-11 w-full rounded-xl text-sm font-semibold"
                disabled={Boolean(planError)}
                onClick={() => {
                  if (showSepa) {
                    setShowSepa(false);
                    return;
                  }
                  setNameOpen(true);
                }}
              >
                {showSepa
                  ? t("pay.cta.hide")
                  : isFreeCheckout
                    ? "Verificatie activeren"
                    : `Bank Transfer — ${euro(totalTodayCents)}`}
              </Button>
            )}

            {/* Laadscherm tijdens het opbouwen van het bunq-verzoek. */}
            {busy && method === "bunq" && (
              <div
                role="status"
                className="flex items-center gap-3 rounded-xl border border-border bg-muted p-3 text-xs text-muted-foreground"
              >
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                <span className="font-medium text-foreground">
                  {t(`pay.bunq.loading.${["connect", "session", "request", "qr"][bunqStep]}`)}
                </span>
              </div>
            )}

            {/* Mandatory legal-name step — verification is identity-bound. */}
            <Dialog open={nameOpen} onOpenChange={setNameOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>{t("checkout.legal_name_modal.title")}</DialogTitle>
                  <DialogDescription>{t("checkout.legal_name_modal.desc")}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="legal-first-name" className="text-xs font-semibold">
                        {t("checkout.legal_name_modal.first_name")}
                      </Label>
                      <Input
                        id="legal-first-name"
                        value={firstName}
                        autoComplete="given-name"
                        placeholder={t("checkout.legal_name_modal.first_name_placeholder")}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="input-field h-10 rounded-xl"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="legal-last-name" className="text-xs font-semibold">
                        {t("checkout.legal_name_modal.last_name")}
                      </Label>
                      <Input
                        id="legal-last-name"
                        value={lastName}
                        autoComplete="family-name"
                        placeholder={t("checkout.legal_name_modal.last_name_placeholder")}
                        onChange={(e) => setLastName(e.target.value)}
                        className="input-field h-10 rounded-xl"
                      />
                    </div>
                  </div>
                  {legalName.trim() !== "" && legalNameError(legalName) && (
                    <p className="text-[11px] text-destructive">{legalNameError(legalName)}</p>
                  )}
                  {handle &&
                    legalName.trim() !== "" &&
                    !legalNameError(legalName) &&
                    Boolean(verifiedHandleError(handle, legalName)) && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">
                        {VERIFIED_STRUCTURE_MESSAGE} Your handle{" "}
                        <span className="font-mono">@{handle}</span> does not match — you may be
                        asked to change it after verification.
                      </p>
                    )}
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {t("checkout.legal_name_modal.privacy")}
                  </p>
                </div>
                <DialogFooter>
                  <Button
                    className="h-11 w-full rounded-xl text-sm font-semibold"
                    disabled={busy || Boolean(legalNameError(legalName))}
                    onClick={() =>
                      void (method === "stripe"
                        ? upgrade()
                        : method === "bunq"
                          ? requestBunq()
                          : requestSepa())
                    }
                  >
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isFreeCheckout
                      ? "Verificatie activeren"
                      : t("checkout.legal_name_modal.button_continue")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {method === "bunq" && showBunq && bunqUrl && (
              <BunqPaymentCard
                shareUrl={bunqUrl}
                reference={bunqRef ?? `ROUT-${(handle || "handle").toUpperCase()}`}
                amountCents={bunqTotalCents ?? totalTodayCents}
                status={
                  bunqPollStatus === "paid" || active
                    ? "paid"
                    : bunqPollStatus === "timeout"
                      ? "timeout"
                      : payment?.status === "processing"
                        ? "processing"
                        : "pending"
                }
                onRetry={retryBunqPoll}
                profileUrl={handle ? `/${handle}` : "/dashboard?verification=success"}
              />
            )}

            {method === "stripe" && cardIntent && (
              <StripePaymentCard
                publishableKey={cardIntent.publishableKey}
                clientSecret={cardIntent.clientSecret}
                intentId={cardIntent.intentId}
                paymentId={cardIntent.paymentId}
                amountCents={cardIntent.totalCents}
                profileUrl={handle ? `/${handle}` : "/dashboard?verification=success"}
                onPaid={() => setCardIntent(null)}
              />
            )}

            {method === "sepa" && showSepa && (
              <SepaTransferCard
                reference={transferReference}
                amountCents={transferAmountCents}
                status={
                  active ? "paid" : payment?.status === "processing" ? "processing" : "pending"
                }
                bank={bank}
                bankState={bankState}
                bunqmeUrl={bunqmeUrl}
                currency={countryCurrency}
              />
            )}
          </div>
        </div>
      )}

      {/* Bedrijfs- en influencerverificatie: rustig, klein, naast de gewone flow. */}
      <BusinessInfluencerRequests />
    </section>
  );
}
