/** Server-only helpers for the paid Early Believer verification flow.
 *  One-time €3.99 lifetime verification, optionally combined with a recurring
 *  "Keep ROUT Alive" donation (€1/month or €5/year). */
import { sql } from "@/lib/neon";

export type Tier = "early_believer";
export type DonationPlan = "none" | "one_time" | "monthly" | "yearly";

export const EARLY_BELIEVER_CENTS = 399;

export const TIER_AMOUNTS: Record<Tier, number> = {
  early_believer: EARLY_BELIEVER_CENTS,
};

export const DONATION_PLAN_CENTS: Record<DonationPlan, number> = {
  none: 0,
  one_time: 100,
  monthly: 100,
  yearly: 1200,
};

export const DONATION_PLAN_INTERVAL: Record<DonationPlan, "month" | "year" | null> = {
  none: null,
  one_time: null,
  monthly: "month",
  yearly: "year",
};

export const TIER_LABELS: Record<Tier, string> = {
  early_believer: "ROUT Early Believer Lifetime Verification",
};

export function stripeKey(): string | null {
  return process.env["STRIPE_SECRET_KEY"] ?? null;
}

export const MAX_DONATION_CENTS = 100_000;

export function clampDonation(cents: number | undefined | null): number {
  if (!Number.isFinite(cents ?? NaN)) return 0;
  return Math.min(Math.max(Math.round(cents as number), 0), MAX_DONATION_CENTS);
}

export function normalizeDonationPlan(plan: string | undefined | null): DonationPlan {
  return plan === "monthly" || plan === "yearly" || plan === "one_time" ? plan : "none";
}

type Row = Record<string, unknown>;

export async function saveLegalName(userId: string, legalName: string) {
  const { legalNameError, normalizeLegalName } = await import("./legal-name");
  const value = normalizeLegalName(legalName);
  const issue = legalNameError(value);
  if (issue) return { ok: false as const, reason: issue };

  try {
    await sql`
      insert into public.profiles (id, verified_legal_name, updated_at)
      values (${userId}, ${value}, now())
      on conflict (id) do update set verified_legal_name = excluded.verified_legal_name, updated_at = now()
    `;
  } catch (error) {
    console.error("[verification:legal-name:save-failed]", error);
    return { ok: false as const, reason: "Could not save your legal name." };
  }
  return { ok: true as const, value };
}

export function trustedCheckoutOrigin(request: Request, submittedOrigin: string): string {
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const requestOrigin = forwardedHost
    ? `${forwardedProto || requestUrl.protocol.replace(":", "")}://${forwardedHost}`
    : requestUrl.origin;

  try {
    const submitted = new URL(submittedOrigin);
    const trusted = new URL(requestOrigin);
    if (submitted.origin === trusted.origin) return submitted.origin;
  } catch {
    // Fall through to the server-observed origin.
  }

  return requestOrigin;
}

/**
 * Creates a Stripe Checkout session with the REST API (no SDK, Worker-safe).
 * With a recurring add-on the session switches to `subscription` mode, where the
 * €3.99 lifetime fee rides along as a one-off line item.
 */
export async function createCheckoutSession(opts: {
  tier: Tier;
  paymentId: string;
  userId: string;
  email?: string | null;
  origin: string;
  donationPlan?: DonationPlan;
  donationCents?: number | null;
  paymentMethod?: "card" | "sepa_debit";
  /** Bedrag voor de eenmalige regel; standaard de kaartprijs van de tier. */
  unitAmountCents?: number;
}): Promise<string> {
  const key = stripeKey();
  if (!key) throw new Error("stripe_not_configured");

  const plan = normalizeDonationPlan(opts.donationPlan);
  const interval = DONATION_PLAN_INTERVAL[plan];
  const { clampContribution } = await import("./contributions");
  const recurringCents = clampContribution(plan, opts.donationCents ?? DONATION_PLAN_CENTS[plan]);

  const body = new URLSearchParams({
    mode: interval ? "subscription" : "payment",
    success_url: `${opts.origin}/dashboard?verification=success`,
    cancel_url: `${opts.origin}/dashboard?verification=cancelled`,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(
      opts.unitAmountCents ?? TIER_AMOUNTS[opts.tier],
    ),
    "line_items[0][price_data][product_data][name]": TIER_LABELS[opts.tier],
    "metadata[payment_id]": opts.paymentId,
    "metadata[user_id]": opts.userId,
    "metadata[tier]": opts.tier,
    "metadata[donation_plan]": plan,
    "metadata[donation_cents]": String(recurringCents),
  });

  if (interval) {
    body.set("line_items[1][quantity]", "1");
    body.set("line_items[1][price_data][currency]", "eur");
    body.set("line_items[1][price_data][unit_amount]", String(recurringCents));
    body.set("line_items[1][price_data][recurring][interval]", interval);
    body.set("line_items[1][price_data][product_data][name]", "Keep ROUT Alive donation");
    body.set("subscription_data[metadata][payment_id]", opts.paymentId);
    body.set("subscription_data[metadata][user_id]", opts.userId);
  } else {
    // "Eenmalige extra bijdrage": geen abonnement, gewoon een tweede
    // eenmalige regel binnen dezelfde betaling.
    if (plan === "one_time" && recurringCents > 0) {
      body.set("line_items[1][quantity]", "1");
      body.set("line_items[1][price_data][currency]", "eur");
      body.set("line_items[1][price_data][unit_amount]", String(recurringCents));
      body.set(
        "line_items[1][price_data][product_data][name]",
        "Keep ROUT Alive one-off contribution",
      );
    }
    body.set("payment_intent_data[metadata][payment_id]", opts.paymentId);
    body.set("payment_intent_data[metadata][user_id]", opts.userId);
  }

  if (opts.paymentMethod === "card") {
    body.set("payment_method_types[0]", "card");
  } else if (opts.paymentMethod === "sepa_debit") {
    body.set("payment_method_types[0]", "sepa_debit");
  }

  if (opts.email) body.set("customer_email", opts.email);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = (await res.json()) as { url?: string; error?: { message?: string } };
  if (!res.ok || !json.url) throw new Error(json.error?.message ?? "stripe_checkout_failed");
  return json.url;
}

/**
 * Embedded checkout (Stripe Elements): creates a PaymentIntent for the total
 * one-off amount and returns its client secret. Only used for non-recurring
 * checkouts — recurring donations still need the hosted subscription flow.
 */
export async function createPaymentIntent(opts: {
  tier: Tier;
  paymentId: string;
  userId: string;
  amountCents: number;
  email?: string | null;
  username?: string | null;
  customerId?: string | null;
  donationPlan?: DonationPlan;
  donationCents?: number | null;
  clientRequestId?: string | null;
  /** Terugkeer-URL na een 3DS-redirect (bankapp / issuer-pagina). */
  returnUrl?: string | null;
}): Promise<{ clientSecret: string; intentId: string }> {
  const key = stripeKey();
  if (!key) throw new Error("stripe_not_configured");

  const plan = normalizeDonationPlan(opts.donationPlan);
  const body = new URLSearchParams({
    amount: String(Math.max(50, Math.round(opts.amountCents))),
    currency: "eur",
    // De "Omschrijving"-kolom in Stripe mag nooit leeg zijn: altijd de
    // gebruiker + het product, zodat het dashboard leesbaar blijft.
    description: stripeDescription(opts.tier, opts.username, opts.email),
    "automatic_payment_methods[enabled]": "true",
    // PSD2/SCA: dwing 3D Secure af zodat uitgevers die extra beveiliging
    // vereisen (o.a. Revolut) de transactie niet direct weigeren.
    "payment_method_options[card][request_three_d_secure]": "any",
    "metadata[payment_id]": opts.paymentId,
    "metadata[user_id]": opts.userId,
    "metadata[tier]": opts.tier,
    "metadata[donation_plan]": plan,
    "metadata[donation_cents]": String(opts.donationCents ?? 0),
    "metadata[username]": opts.username ?? "",
    "metadata[email]": opts.email ?? "",
  });
  // GEEN `receipt_email`: native Stripe-bonnetjes staan uit, en het meesturen
  // van dit veld dwingt Stripe alsnog een eigen mail te versturen. Alle
  // financiële communicatie loopt exclusief via Brevo (met PDF-factuur).
  if (opts.customerId) {
    body.set("customer", opts.customerId);
    body.set("metadata[customer_id]", opts.customerId);
  }
  // BELANGRIJK: Stripe weigert `return_url` bij het *aanmaken* van een intent
  // ("cannot be passed when creating a PaymentIntent unless confirm is true").
  // De terugkeer-URL hoort dus uitsluitend bij de bevestiging: Stripe.js stuurt
  // hem mee in `confirmParams.return_url` (zie StripePaymentCard).
  void opts.returnUrl;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  // Idempotent: een herhaalde klik/netwerkfout maakt nooit een tweede intent.
  if (opts.clientRequestId) headers["Idempotency-Key"] = opts.clientRequestId;

  const res = await fetch("https://api.stripe.com/v1/payment_intents", {
    method: "POST",
    headers,
    body,
  });
  const json = (await res.json()) as {
    id?: string;
    client_secret?: string;
    error?: { message?: string };
  };
  if (!res.ok || !json.client_secret || !json.id) {
    throw new Error(json.error?.message ?? "stripe_intent_failed");
  }
  return { clientSecret: json.client_secret, intentId: json.id };
}

/** Leesbare omschrijving voor het Stripe-dashboard; nooit leeg. */
export function stripeDescription(
  tier: Tier,
  username?: string | null,
  email?: string | null,
): string {
  const who = [username?.trim(), email?.trim()].filter(Boolean);
  const suffix = who.length
    ? ` — ROUT User: ${username?.trim() ?? email?.trim()}${
        username?.trim() && email?.trim() ? ` (${email.trim()})` : ""
      }`
    : "";
  return `${TIER_LABELS[tier]}${suffix}`;
}

/** Statussen waarbij een bestaande intent veilig hergebruikt mag worden. */
const REUSABLE_INTENT_STATUSES = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
]);

/**
 * Hergebruikt een openstaande PaymentIntent na een afgebroken 3DS-stap of een
 * tijdelijke weigering. Zo ontstaat er nooit een tweede intent voor dezelfde
 * poging (dubbele transacties, dubbele Radar-checks, dubbele facturen).
 *
 * Geeft `null` terug wanneer de intent niet bestaat of niet meer bruikbaar is;
 * de aanroeper maakt dan alsnog een nieuwe aan.
 */
export async function reusePaymentIntent(opts: {
  intentId: string;
  amountCents: number;
  paymentId: string;
  userId: string;
  tier: Tier;
  email?: string | null;
  username?: string | null;
  donationPlan?: DonationPlan;
  donationCents?: number | null;
}): Promise<{ clientSecret: string; intentId: string } | null> {
  const key = stripeKey();
  if (!key) return null;
  const url = `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(opts.intentId)}`;
  try {
    const current = (await (
      await fetch(url, { headers: { Authorization: `Bearer ${key}` } })
    ).json()) as { id?: string; status?: string; client_secret?: string };
    if (!current.id || !current.status || !REUSABLE_INTENT_STATUSES.has(current.status))
      return null;

    const body = new URLSearchParams({
      amount: String(Math.max(50, Math.round(opts.amountCents))),
      description: stripeDescription(opts.tier, opts.username, opts.email),
      "metadata[payment_id]": opts.paymentId,
      "metadata[user_id]": opts.userId,
      "metadata[tier]": opts.tier,
      "metadata[donation_plan]": normalizeDonationPlan(opts.donationPlan),
      "metadata[donation_cents]": String(opts.donationCents ?? 0),
      "metadata[username]": opts.username ?? "",
      "metadata[email]": opts.email ?? "",
    });
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const json = (await res.json()) as { id?: string; client_secret?: string };
    if (!res.ok || !json.id || !json.client_secret) return null;
    return { clientSecret: json.client_secret, intentId: json.id };
  } catch (error) {
    console.error("[verification] hergebruik intent mislukt", error);
    return null;
  }
}

/** Reads a PaymentIntent server-side; the client is never trusted for status. */
export async function readPaymentIntent(intentId: string): Promise<{
  status: string;
  paymentId: string | null;
  /** Foutcode van de bank (bv. `card_declined`, `authentication_required`). */
  errorCode: string | null;
  errorMessage: string | null;
  declineCode: string | null;
  /** True zodra Stripe nog een 3DS-stap verwacht. */
  requiresAction: boolean;
}> {
  const key = stripeKey();
  if (!key) throw new Error("stripe_not_configured");
  const res = await fetch(
    `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(intentId)}`,
    { headers: { Authorization: `Bearer ${key}` } },
  );
  const json = (await res.json()) as {
    status?: string;
    metadata?: Record<string, string>;
    last_payment_error?: { code?: string; message?: string; decline_code?: string };
    error?: { message?: string };
  };
  if (!res.ok || !json.status) throw new Error(json.error?.message ?? "stripe_intent_read_failed");
  return {
    status: json.status,
    paymentId: json.metadata?.["payment_id"] ?? null,
    errorCode: json.last_payment_error?.code ?? null,
    errorMessage: json.last_payment_error?.message ?? null,
    declineCode: json.last_payment_error?.decline_code ?? null,
    requiresAction: json.status === "requires_action" || json.status === "requires_confirmation",
  };
}

/** Korte, begrensde herkansing voor broze IO (PDF-bouw, mailverzending). */
export async function withRetry<T>(
  task: () => Promise<T>,
  opts: { label: string; correlationId: string; attempts?: number },
): Promise<T> {
  const total = opts.attempts ?? 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= total; attempt++) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      console.error(`[verification] ${opts.label} mislukt`, {
        correlationId: opts.correlationId,
        attempt: `${attempt}/${total}`,
        error: error instanceof Error ? error.message : String(error),
      });
      if (attempt === total) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Admin-waarschuwing bij een definitieve factuur- of mailstoring. */
async function alertAdmin(params: {
  FAILED_TEMPLATE_ID: number | string;
  USED_FALLBACK_ID: number | string;
  RECIPIENT_EMAIL: string;
  REASON: string;
}): Promise<void> {
  try {
    const { notifyAdminOfFallback } = await import("@/emails/send.server");
    notifyAdminOfFallback(params);
  } catch (error) {
    console.error("[verification] admin-alert kon niet worden verstuurd", error);
  }
}

/**
 * Rondt één kaartbetaling af tegen Stripe: leest de echte status, activeert bij
 * succes en vertaalt het resultaat naar één vaste uitkomst. Zowel de directe
 * bevestiging als de terugkeer uit een 3DS-redirect gebruiken dit pad, zodat er
 * nooit een tweede intent of dubbele activatie ontstaat.
 */
export async function finalizeCardPayment(opts: {
  intentId: string;
  paymentId: string;
  userId: string;
}): Promise<
  | { ok: true; status: "succeeded" | "processing"; paymentId: string }
  | {
      ok: false;
      reason: "not_found" | "stripe_unavailable" | "requires_action" | "not_paid";
      status?: string;
      errorCode?: string | null;
      declineCode?: string | null;
      paymentId?: string;
    }
> {
  const rows = (await sql`
    select id, user_id, status from public.verification_payments
     where id = ${opts.paymentId} limit 1
  `) as Row[];
  const row = rows[0];
  // Zero-trust: alleen de eigenaar van deze betaling mag ze afronden.
  if (!row || (row["user_id"] as string) !== opts.userId) {
    return { ok: false, reason: "not_found" };
  }
  if (row["status"] === "paid") {
    return { ok: true, status: "succeeded", paymentId: opts.paymentId };
  }

  let intent: Awaited<ReturnType<typeof readPaymentIntent>>;
  try {
    intent = await readPaymentIntent(opts.intentId);
  } catch (err) {
    console.error("[verification] intent read failed", {
      message: err instanceof Error ? err.message.slice(0, 200) : "read_failed",
    });
    return { ok: false, reason: "stripe_unavailable" };
  }
  if (intent.paymentId && intent.paymentId !== opts.paymentId) {
    return { ok: false, reason: "not_found" };
  }

  if (intent.status === "succeeded") {
    await activateVerification(opts.paymentId, opts.intentId);
    return { ok: true, status: "succeeded", paymentId: opts.paymentId };
  }
  if (intent.status === "processing") {
    await markPaymentStatus(opts.paymentId, "processing", opts.intentId);
    return { ok: true, status: "processing", paymentId: opts.paymentId };
  }
  if (intent.requiresAction) {
    return {
      ok: false,
      reason: "requires_action",
      status: intent.status,
      errorCode: intent.errorCode,
      declineCode: intent.declineCode,
      paymentId: opts.paymentId,
    };
  }
  if (intent.status === "canceled") {
    await markPaymentStatus(opts.paymentId, "failed", opts.intentId, "canceled");
  } else if (intent.errorCode) {
    await markPaymentStatus(opts.paymentId, "failed", opts.intentId, intent.errorCode);
  }
  return {
    ok: false,
    reason: "not_paid",
    status: intent.status,
    errorCode: intent.errorCode,
    declineCode: intent.declineCode,
    paymentId: opts.paymentId,
  };
}

/**
 * Zoekt de betaling die bij een PaymentIntent hoort (metadata eerst, daarna de
 * opgeslagen provider-referentie). Nodig wanneer Stripe na een 3DS-redirect
 * alleen `payment_intent` in de URL meegeeft.
 */
export async function paymentIdForIntent(intentId: string): Promise<string | null> {
  try {
    const intent = await readPaymentIntent(intentId);
    if (intent.paymentId) return intent.paymentId;
  } catch (error) {
    console.error("[verification] intent lookup mislukt", error);
  }
  const rows = (await sql`
    select id from public.verification_payments
     where provider_ref = ${intentId} order by created_at desc limit 1
  `) as Row[];
  return (rows[0]?.["id"] as string | undefined) ?? null;
}

/** Marks a payment paid, flips the profile to Early Believer and provisions the alias. */
export async function activateVerification(paymentId: string, providerRef: string | null) {
  const paymentRows = (await sql`
    select id, user_id, tier, status, donation_plan, amount_cents, donation_cents,
           reference_code, provider, created_at

      from public.verification_payments where id = ${paymentId} limit 1
  `) as Row[];
  const payment = paymentRows[0];
  if (!payment) return false;
  if (payment["status"] === "paid") return true;

  // Idempotentie-slot: alleen de transactie die de rij écht van "niet betaald"
  // naar "paid" tilt, gaat verder. Wordt dezelfde webhook twee keer tegelijk
  // geleverd (Stripe én bunq doen dat bij trage antwoorden), dan raakt de
  // tweede nul rijen en stopt hier — geen dubbele activatie, geen tweede
  // factuur-PDF, geen tweede Brevo-mail.
  const claimed = (await sql`
    update public.verification_payments
       set status = 'paid', provider_ref = ${providerRef}, updated_at = now()
     where id = ${payment["id"] as string} and status <> 'paid'
    returning id
  `) as Row[];
  if (claimed.length === 0) return true;

  const userId = payment["user_id"] as string;
  const profileRows = (await sql`
    select verified_legal_name, handle from public.profiles where id = ${userId} limit 1
  `) as Row[];

  const hasLegalName = Boolean((profileRows[0]?.["verified_legal_name"] as string | null)?.trim());

  await sql`
    update public.profiles
       set tier = ${payment["tier"] as string},
           is_paid = true,
           verified = ${hasLegalName},
           is_early_believer = true,
           status = 'active',
           -- Betaalde leden krijgen meteen het Pro-subdomein ([handle].r.rout.be).
           subdomain_tier = case when subdomain_tier = 'root_lifetime' then subdomain_tier else 'pro' end,
           verified_at = case when ${hasLegalName} then now() else verified_at end,
           updated_at = now()
     where id = ${userId}

  `;

  await sql`
    insert into public.security_events (user_id, kind, severity, message, details)
    values (${userId}, 'verification_activated', 'info',
            ${`Early Believer verification activated (${payment["tier"] as string}).`},
            ${JSON.stringify({ payment_id: payment["id"] })})
  `;

  const { awardBadges } = await import("./badge-grants.server");
  const slugs: ("early_believer" | "verified" | "supporter")[] = ["early_believer"];
  if (hasLegalName) slugs.push("verified");
  const donationPlan = payment["donation_plan"] as string | null;
  if (donationPlan && donationPlan !== "none") slugs.push("supporter");
  const source = donationPlan && donationPlan !== "none" ? "subscription" : "card";
  await awardBadges(userId, slugs, source, { payment_id: payment["id"] });

  // Facturatie loopt via de gedeelde keten, precies zoals bij een donatie of
  // een herhaalbetaling: nummering, PDF en Brevo-mail met bijlage.
  const baseCents = Number(payment["amount_cents"] ?? 0);
  const donationCents = Number(payment["donation_cents"] ?? 0);
  const amountCents = Math.max(0, baseCents + donationCents);
  const methodLabel = (payment["provider"] as string | null) ?? "card";
  const lines = [
    { label: `ROUT verificatie — ${payment["tier"] as string}`, amountCents: baseCents },
  ];
  if (donationCents > 0) lines.push({ label: "Vrijwillige bijdrage", amountCents: donationCents });

  const { deliverPaymentInvoice } = await import("./invoice-delivery.server");
  await deliverPaymentInvoice({
    paymentId: String(payment["id"]),
    userId,
    sequenceAt: String(payment["created_at"]),
    lines,
    totalCents: amountCents,
    paymentMethod: methodLabel,
    reference: (payment["reference_code"] as string | null) ?? String(payment["id"]),
    template: "payment_succeeded",
    extraParams: {
      TIER: payment["tier"] as string,
      DONATION_PLAN: donationPlan ?? "none",
    },
  });

  // Telt mee als "geverifieerde vriend" voor wie dit lid uitnodigde.
  const { markInviteVerified } = await import("./referral.server");
  await markInviteVerified(userId);

  // Twee pagina's: de gratis /u/-pagina blijft, en het geverifieerde profiel
  // verhuist naar voornaam.achternaam (of de eerstvolgende vrije variant).
  try {
    const { ensureFreeAliasProfile } = await import("./alias-profile.server");
    await ensureFreeAliasProfile(userId);
    if (hasLegalName) {
      const { activateVerifiedRootHandle } = await import("./verified-root-handle.server");
      await activateVerifiedRootHandle(
        userId,
        profileRows[0]?.["verified_legal_name"] as string | null,
      );
    }
  } catch (error) {
    console.error("verified root handle activation failed", error);
  }

  try {
    const { provisionAliasForUser } = await import("./alias.server");
    await provisionAliasForUser(userId);
  } catch (error) {
    console.error("alias provisioning failed", error);
  }

  return true;
}

/**
 * Records a non-final payment outcome (SEPA still clearing, failed, expired,
 * incomplete). Never touches the profile: only a confirmed charge grants
 * entitlements.
 */
export async function markPaymentStatus(
  paymentId: string,
  status: "processing" | "failed" | "expired" | "refunded" | "incomplete",
  providerRef: string | null,
  reason?: string | null,
) {
  const rows = (await sql`
    select id, user_id, status from public.verification_payments where id = ${paymentId} limit 1
  `) as Row[];
  const payment = rows[0];
  if (!payment) return false;
  if (payment["status"] === "paid" && status !== "refunded") return true;

  if (providerRef) {
    await sql`
      update public.verification_payments set status = ${status}, provider_ref = ${providerRef}, updated_at = now()
       where id = ${payment["id"] as string}
    `;
  } else {
    await sql`
      update public.verification_payments set status = ${status}, updated_at = now()
       where id = ${payment["id"] as string}
    `;
  }

  const userId = payment["user_id"] as string;
  await sql`
    insert into public.security_events (user_id, kind, severity, message, details)
    values (${userId}, ${`payment_${status}`}, ${status === "processing" ? "info" : "warning"},
            ${`Verification payment ${status}${reason ? `: ${reason}` : ""}.`},
            ${JSON.stringify({ payment_id: payment["id"], ...(reason ? { reason } : {}) })})
  `;

  const { notifyUser } = await import("./notifications.server");
  const checkoutUrl = `${(process.env["PUBLIC_SITE_URL"] ?? "https://rout.be").replace(/\/$/, "")}/dashboard?verification=retry`;
  if (status === "processing") {
    await notifyUser(userId, "payment_processing", { payment_id: payment["id"] });
  } else if (status === "expired") {
    // An expired or cancelled Checkout session is its own story: nothing was
    // charged, the member simply has to start the payment again.
    await notifyUser(
      userId,
      "payment_expired",
      { payment_id: payment["id"], status, reason },
      { RETRY_URL: checkoutUrl, REASON: reason ?? "session_expired" },
    );
  } else if (status === "failed" || status === "incomplete") {
    await notifyUser(
      userId,
      "payment_failed",
      { payment_id: payment["id"], status, reason },
      { RETRY_URL: checkoutUrl, REASON: reason ?? status },
    );
  } else if (status === "refunded") {
    await notifyUser(userId, "payment_refunded", { payment_id: payment["id"] });
  }

  return true;
}

/** Refund or chargeback: pulls the paid entitlements and badges back in. */
export async function revokeVerification(paymentId: string, reason: string) {
  const rows = (await sql`
    select id, user_id from public.verification_payments where id = ${paymentId} limit 1
  `) as Row[];
  const payment = rows[0];
  if (!payment) return false;
  const userId = payment["user_id"] as string;

  await sql`update public.verification_payments set status = 'refunded', updated_at = now() where id = ${payment["id"] as string}`;

  await sql`
    update public.profiles
       set tier = 'free', is_paid = false, verified = false, is_early_believer = false,
           verified_at = null, updated_at = now()
     where id = ${userId}
  `;

  const { revokeBadges } = await import("./badge-grants.server");
  await revokeBadges(userId, ["early_believer", "verified", "supporter"], "refund", {
    payment_id: payment["id"],
    reason,
  });

  await sql`
    insert into public.security_events (user_id, kind, severity, message, details)
    values (${userId}, 'verification_revoked', 'warning', ${`Verification revoked (${reason}).`},
            ${JSON.stringify({ payment_id: payment["id"], reason })})
  `;

  const { notifyUser } = await import("./notifications.server");
  await notifyUser(userId, "payment_refunded", { payment_id: payment["id"], reason });

  return true;
}

/** Recurring donation stopped: the lifetime verification stays, the badge does not. */
export async function endRecurringDonation(paymentId: string) {
  const rows = (await sql`
    select id, user_id from public.verification_payments where id = ${paymentId} limit 1
  `) as Row[];
  const payment = rows[0];
  if (!payment) return false;
  const userId = payment["user_id"] as string;

  await sql`
    update public.verification_payments set donation_plan = 'none', donation_cents = 0, updated_at = now()
     where id = ${payment["id"] as string}
  `;

  const { revokeBadges } = await import("./badge-grants.server");
  await revokeBadges(userId, ["supporter"], "subscription", { payment_id: payment["id"] });

  await sql`
    insert into public.security_events (user_id, kind, severity, message, details)
    values (${userId}, 'donation_cancelled', 'info', 'Recurring ROUT donation cancelled.',
            ${JSON.stringify({ payment_id: payment["id"] })})
  `;

  const { notifyUser } = await import("./notifications.server");
  await notifyUser(userId, "subscription_cancelled", { payment_id: payment["id"] });

  return true;
}

/** Successful renewal: keeps the Supporter badge lit for returning donors. */
export async function confirmRecurringDonation(paymentId: string) {
  const rows = (await sql`
    select id, user_id, donation_plan, donation_cents, provider, reference_code, created_at
      from public.verification_payments where id = ${paymentId} limit 1
  `) as Row[];
  const payment = rows[0];
  if (!payment) return false;
  const donationPlan = payment["donation_plan"] as string | null;
  if (!donationPlan || donationPlan === "none") return true;
  const userId = payment["user_id"] as string;

  const { awardBadges } = await import("./badge-grants.server");
  await awardBadges(userId, ["supporter"], "subscription", { payment_id: payment["id"] });

  // Ook een verlenging krijgt een eigen genummerde factuur met PDF-bijlage:
  // dezelfde keten als de eerste betaling, zodat geen enkele afschrijving
  // zonder bewijsstuk bij het lid aankomt.
  const donationCents = Math.max(0, Number(payment["donation_cents"] ?? 0));
  const { deliverPaymentInvoice } = await import("./invoice-delivery.server");
  await deliverPaymentInvoice({
    paymentId: String(payment["id"]),
    userId,
    sequenceAt: new Date().toISOString(),
    lines: [
      {
        label: `Keep ROUT Alive — ${donationPlan === "yearly" ? "jaarlijkse" : "maandelijkse"} bijdrage`,
        amountCents: donationCents,
      },
    ],
    totalCents: donationCents,
    paymentMethod: (payment["provider"] as string | null) ?? "card",
    reference: (payment["reference_code"] as string | null) ?? String(payment["id"]),
    template: "subscription_renewed",
    extraParams: { DONATION_PLAN: donationPlan },
  });
  return true;
}
