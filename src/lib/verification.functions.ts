import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

const donationPlanSchema = z.enum(["none", "one_time", "monthly", "yearly"]).optional();
const legalNameSchema = z.string().trim().min(3).max(120);

const promoSchema = z.string().max(64).optional();

const checkoutSchema = z.object({
  origin: z.string().url().max(300),
  paymentMethod: z.literal("card"),
  donationPlan: donationPlanSchema,
  donationCents: z.number().int().min(0).max(100_000).optional(),
  legalName: legalNameSchema,
  promoCode: promoSchema,
});

/**
 * Zero-trust verification start: the e-mail must already be confirmed, a pending
 * payment row is created and a Stripe Checkout session is returned. The profile
 * only becomes an Early Believer when the payment webhook confirms the charge.
 */
export const startVerification = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => checkoutSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { emailConfirmed } = await import("./email-confirmed");
    if (!emailConfirmed(context.claims)) {
      return { ok: false as const, reason: "email_unconfirmed" as const };
    }

    const { saveLegalName } = await import("./verification.server");
    const legal = await saveLegalName(context.userId, data.legalName);
    if (!legal.ok) return { ok: false as const, reason: legal.reason };

    const { stripeKey, createCheckoutSession, normalizeDonationPlan, trustedCheckoutOrigin } =
      await import("./verification.server");
    const { clampContribution } = await import("./contributions");
    const { dbAdmin } = await import("@/lib/db/admin.server");

    // Check the provider BEFORE writing a payment row: an unconfigured Stripe
    // would otherwise leave an orphan pending payment behind on every click.
    if (!stripeKey()) {
      return { ok: false as const, reason: "stripe_not_configured" as const };
    }

    const donationPlan = normalizeDonationPlan(data.donationPlan ?? "none");
    const donationCents = clampContribution(donationPlan, data.donationCents ?? null);

    // Prijs volgt de betaalmethode; de promocode wordt hier opnieuw gevalideerd
    // zodat een aangepaste client nooit zijn eigen korting kan verzinnen.
    const { resolvePromo, recordPromoRedemption } = await import("./promo.server");
    const { bestPriceCents } = await import("./referral-discount.server");
    const promo = await resolvePromo(data.promoCode ?? null);
    const baseCents = await bestPriceCents("card", promo, context.userId);

    const { getRequest } = await import("@tanstack/react-start/server");
    const origin = trustedCheckoutOrigin(getRequest(), data.origin);

    const { data: payment, error } = await dbAdmin
      .from("verification_payments")
      .insert({
        user_id: context.userId,
        tier: "early_believer",
        amount_cents: baseCents,
        donation_cents: donationCents,
        donation_plan: donationPlan,
        provider: "stripe",
        reference_code: `ROUT-${Math.floor(1000 + Math.random() * 9000)}`,
      })
      .select("id")
      .single();
    if (error || !payment) {
      console.error("[verification] payment insert failed", error);
      return { ok: false as const, reason: "payment_record_failed" as const };
    }

    // Volledig gratis dankzij de promocode: geen Stripe-sessie nodig, de
    // verificatie wordt meteen geactiveerd.
    if (baseCents === 0 && donationCents === 0) {
      const { activateVerification } = await import("./verification.server");
      await activateVerification(payment.id, `promo:${promo?.code ?? "free"}`);
      if (promo) await recordPromoRedemption(promo.code);
      return { ok: true as const, url: `${origin}/dashboard?verification=success` };
    }

    try {
      const url = await createCheckoutSession({
        tier: "early_believer",
        paymentId: payment.id,
        userId: context.userId,
        email: (context.claims as { email?: string } | null)?.email ?? null,
        origin,
        donationPlan,
        donationCents,
        paymentMethod: data.paymentMethod,
        unitAmountCents: baseCents,
      });

      return { ok: true as const, url };
    } catch (err) {
      // A failed session must not leave a pending row that a webhook can never
      // resolve — mark it, and tell the user what actually went wrong.
      console.error("[verification] stripe checkout failed", {
        message: err instanceof Error ? err.message.slice(0, 300) : "checkout_failed",
      });
      await dbAdmin.from("verification_payments").update({ status: "failed" }).eq("id", payment.id);
      return { ok: false as const, reason: "checkout_failed" as const };
    }
  });

const intentSchema = z.object({
  donationPlan: donationPlanSchema,
  donationCents: z.number().int().min(0).max(100_000).optional(),
  legalName: legalNameSchema,
  promoCode: promoSchema,
  clientRequestId: z.string().min(8).max(80).optional(),
});

/**
 * Embedded card checkout (Stripe Elements). Creates the pending payment row and
 * returns a PaymentIntent client secret so the Payment Element can confirm the
 * charge on rout.be itself. Recurring donations still need the hosted flow.
 */
export const startCardPaymentIntent = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => intentSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { emailConfirmed } = await import("./email-confirmed");
    if (!emailConfirmed(context.claims)) {
      return { ok: false as const, reason: "email_unconfirmed" as const };
    }

    const { saveLegalName, stripeKey, createPaymentIntent, normalizeDonationPlan } =
      await import("./verification.server");
    const legal = await saveLegalName(context.userId, data.legalName);
    if (!legal.ok) return { ok: false as const, reason: legal.reason };

    if (!stripeKey()) return { ok: false as const, reason: "stripe_not_configured" as const };
    const publishableKey = process.env["STRIPE_PUBLISHABLE_KEY"] ?? null;
    if (!publishableKey) return { ok: false as const, reason: "stripe_not_configured" as const };

    const donationPlan = normalizeDonationPlan(data.donationPlan ?? "none");
    if (donationPlan === "monthly" || donationPlan === "yearly") {
      // Een terugkerende bijdrage vraagt een abonnement: dat blijft de gehoste route.
      return { ok: false as const, reason: "recurring_requires_redirect" as const };
    }

    const { clampContribution } = await import("./contributions");
    const donationCents = clampContribution(donationPlan, data.donationCents ?? null);

    const { resolvePromo, recordPromoRedemption } = await import("./promo.server");
    const { bestPriceCents } = await import("./referral-discount.server");
    const promo = await resolvePromo(data.promoCode ?? null);
    const baseCents = await bestPriceCents("card", promo, context.userId);
    const totalCents = baseCents + donationCents;

    const { dbAdmin } = await import("@/lib/db/admin.server");
    const { sql } = await import("@/lib/neon");
    const email = (context.claims as { email?: string } | null)?.email ?? null;

    // Gebruikersnaam voor de Stripe-omschrijving (nooit een lege kolom).
    let username: string | null = null;
    try {
      const rows = (await sql`
        select handle from public.profiles where id = ${context.userId} limit 1
      `) as { handle?: string | null }[];
      username = rows[0]?.handle ?? null;
    } catch {
      /* omschrijving valt terug op het e-mailadres */
    }

    // 3DS afgebroken, kaartcontrole of tijdelijke weigering: die intent blijft
    // bruikbaar. We hergebruiken hem (bedrag + metadata bijgewerkt) in plaats
    // van een tweede intent te maken — geen dubbele transacties, geen loops.
    if (totalCents > 0) {
      try {
        const openRows = (await sql`
          select id, provider_ref
            from public.verification_payments
           where user_id = ${context.userId}
             and provider = 'stripe'
             and status in ('pending', 'incomplete')
             and provider_ref is not null
           order by created_at desc
           limit 1
        `) as { id: string; provider_ref: string | null }[];
        const open = openRows[0];
        if (open?.provider_ref?.startsWith("pi_")) {
          const { reusePaymentIntent } = await import("./verification.server");
          const reused = await reusePaymentIntent({
            intentId: open.provider_ref,
            amountCents: totalCents,
            paymentId: open.id,
            userId: context.userId,
            tier: "early_believer",
            email,
            username,
            donationPlan,
            donationCents,
          });
          if (reused) {
            await dbAdmin
              .from("verification_payments")
              .update({
                amount_cents: baseCents,
                donation_cents: donationCents,
                donation_plan: donationPlan,
              })
              .eq("id", open.id);
            return {
              ok: true as const,
              free: false as const,
              clientSecret: reused.clientSecret,
              intentId: reused.intentId,
              paymentId: open.id,
              publishableKey,
              totalCents,
            };
          }
        }
      } catch (err) {
        console.error("[verification] hergebruik openstaande intent mislukt", err);
      }
    }

    // Niets bruikbaars meer open: sluit verlaten pogingen stil af (geen mail,
    // geen entitlement) zodat een latere webhook ze nooit activeert. Rijen met
    // status "processing" en "paid" blijven onaangeroerd.
    try {
      await sql`
        update public.verification_payments
           set status = 'expired', updated_at = now()
         where user_id = ${context.userId}
           and provider = 'stripe'
           and status in ('pending', 'incomplete')
      `;
    } catch (err) {
      console.error("[verification] opruimen verlaten pogingen mislukt", err);
    }

    const { data: payment, error } = await dbAdmin
      .from("verification_payments")
      .insert({
        user_id: context.userId,
        tier: "early_believer",
        amount_cents: baseCents,
        donation_cents: donationCents,
        donation_plan: donationPlan,
        provider: "stripe",
        reference_code: `ROUT-${Math.floor(1000 + Math.random() * 9000)}`,
      })
      .select("id")
      .single();
    if (error || !payment) {
      console.error("[verification] payment insert failed", error);
      return { ok: false as const, reason: "payment_record_failed" as const };
    }

    // Volledig gratis door promo/referral: geen Stripe nodig.
    if (totalCents === 0) {
      const { activateVerification } = await import("./verification.server");
      await activateVerification(payment.id, `promo:${promo?.code ?? "free"}`);
      if (promo) await recordPromoRedemption(promo.code);
      return { ok: true as const, free: true as const };
    }

    try {
      const intent = await createPaymentIntent({
        tier: "early_believer",
        paymentId: payment.id,
        userId: context.userId,
        amountCents: totalCents,
        email,
        username,
        donationPlan,
        donationCents,
        clientRequestId: data.clientRequestId ?? null,
      });

      // Bewaar de intent-id meteen: zonder deze verwijzing kan de polling een
      // asynchrone betaling (Bancontact, iDEAL, QR) later niet verzoenen.
      await dbAdmin
        .from("verification_payments")
        .update({ provider_ref: intent.intentId })
        .eq("id", payment.id);
      return {
        ok: true as const,
        free: false as const,
        clientSecret: intent.clientSecret,
        intentId: intent.intentId,
        paymentId: payment.id,
        publishableKey,
        totalCents,
      };
    } catch (err) {
      console.error("[verification] stripe intent failed", {
        message: err instanceof Error ? err.message.slice(0, 300) : "intent_failed",
      });
      await dbAdmin.from("verification_payments").update({ status: "failed" }).eq("id", payment.id);
      return { ok: false as const, reason: "checkout_failed" as const };
    }
  });

/**
 * Verifies the outcome of an embedded payment against Stripe itself and — only
 * on a confirmed charge — activates the verification. The webhook remains the
 * safety net; this makes the success screen instant.
 */
export const confirmCardPaymentIntent = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z.object({ intentId: z.string().min(6).max(120), paymentId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { finalizeCardPayment } = await import("./verification.server");
    return await finalizeCardPayment({
      intentId: data.intentId,
      paymentId: data.paymentId,
      userId: context.userId,
    });
  });

/**
 * Hervat een betaling na een 3DS-redirect waarbij alleen `payment_intent` in de
 * terugkeer-URL staat: de bijhorende betaling wordt server-side opgezocht en
 * dezelfde afronding volgt. Zo hoeft de gebruiker nooit een nieuwe checkout te
 * starten na een bankapp of 3DS-venster.
 */
export const resumeCardPaymentIntent = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => z.object({ intentId: z.string().min(6).max(120) }).parse(data))
  .handler(async ({ data, context }) => {
    const { finalizeCardPayment, paymentIdForIntent } = await import("./verification.server");
    const paymentId = await paymentIdForIntent(data.intentId);
    if (!paymentId) return { ok: false as const, reason: "not_found" as const };
    return await finalizeCardPayment({
      intentId: data.intentId,
      paymentId,
      userId: context.userId,
    });
  });

/**
 * Bank-transfer route: registers a pending payment with a human-readable
 * reference so an admin can match the SEPA transfer manually. No card involved,
 * so nothing is activated here — approval happens in the admin dashboard.
 */
export const startSepaVerification = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        donationPlan: donationPlanSchema,
        donationCents: z.number().int().min(0).max(100_000).optional(),
        legalName: legalNameSchema,
        promoCode: promoSchema,
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { emailConfirmed } = await import("./email-confirmed");
    if (!emailConfirmed(context.claims)) {
      return { ok: false as const, reason: "email_unconfirmed" as const };
    }

    const { normalizeDonationPlan, saveLegalName } = await import("./verification.server");
    const legal = await saveLegalName(context.userId, data.legalName);
    if (!legal.ok) return { ok: false as const, reason: legal.reason };

    const { clampContribution } = await import("./contributions");
    const { dbAdmin } = await import("@/lib/db/admin.server");

    const reference = `ROUT-${Math.floor(1000 + Math.random() * 9000)}`;
    const donationPlan = normalizeDonationPlan(data.donationPlan ?? "none");
    // A manual transfer cannot carry a recurring mandate: the chosen donation
    // rides along once, inside the same transfer, so the expected amount on the
    // bank statement matches what the CTA promised.
    const donationCents = clampContribution(donationPlan, data.donationCents ?? null);

    const { resolvePromo } = await import("./promo.server");
    const { bestPriceCents } = await import("./referral-discount.server");
    const promo = await resolvePromo(data.promoCode ?? null);
    const baseCents = await bestPriceCents("sepa", promo, context.userId);
    const totalCents = baseCents + donationCents;

    const { data: payment, error } = await dbAdmin
      .from("verification_payments")
      .insert({
        user_id: context.userId,
        tier: "early_believer",
        amount_cents: baseCents,
        donation_cents: donationCents,
        donation_plan: donationPlan,

        provider: "sepa",
        reference_code: reference,
      })
      .select("id, amount_cents, reference_code")
      .single();

    if (error || !payment) return { ok: false as const };
    return {
      ok: true as const,
      reference: payment.reference_code ?? reference,
      totalCents,
    };
  });

/** Current verification state for the signed-in user. */
export const getVerificationState = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const selectProfile = () =>
      context.db
        .from("profiles")
        .select("username, tier, verified, status, verified_at, is_early_believer, is_paid")
        .eq("id", context.userId)
        .maybeSingle();

    const { data: initialData, error } = await selectProfile();
    if (error) throw new Error("profile_status_unavailable");
    let data = initialData;

    if (!data) {
      const { error: repairError } = await context.db
        .from("profiles")
        .upsert({ id: context.userId }, { onConflict: "id" });
      if (repairError) throw new Error("profile_repair_failed");
      const repaired = await selectProfile();
      if (repaired.error || !repaired.data) throw new Error("profile_status_unavailable");
      data = repaired.data;
    }

    const { data: roles } = await context.db
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);

    return {
      username: data.username ?? null,
      tier: data.tier,
      verified: Boolean(data.verified),
      isEarlyBeliever: Boolean(data.is_early_believer),
      isPaid: Boolean(data.is_paid),
      status: data.status,
      roles: (roles ?? []).map((row) => row.role as string),
    };
  });

/**
 * Resolves a Bluesky handle to its DID through the AT Protocol identity API and
 * stores it on the caller's profile, so `<handle>.rout.be/.well-known/atproto-did`
 * can serve it.
 */
export const resolveBskyHandle = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z.object({ handle: z.string().trim().min(1).max(253) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertBlueskyAccess } = await import("./entitlement.server");
    await assertBlueskyAccess(context.userId); // deep-link / direct-RPC protection
    const handle = data.handle.replace(/\s+/g, "").replace(/^@+/, "").toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(handle)) {
      return { success: false as const, error: "That does not look like a Bluesky handle." };
    }

    let did: string | null = null;
    try {
      const res = await fetch(
        `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
        { headers: { accept: "application/json" } },
      );
      if (!res.ok) {
        return { success: false as const, error: `Bluesky could not resolve @${handle}.` };
      }
      const body = (await res.json()) as { did?: string };
      did = typeof body.did === "string" && body.did.startsWith("did:") ? body.did : null;
    } catch {
      return { success: false as const, error: "Could not reach Bluesky. Try again." };
    }

    if (!did) return { success: false as const, error: `No DID found for @${handle}.` };

    const { error } = await context.db
      .from("profiles")
      .update({ bluesky_did: did })
      .eq("id", context.userId);
    if (error) return { success: false as const, error: "Could not save the DID to your profile." };

    return { success: true as const, did, handle };
  });

/**
 * Which payment routes this deployment can actually offer. The bank transfer
 * always works; card checkout needs a configured Stripe key. Exposes a boolean
 * only — never key material.
 */
export const getPaymentConfig = createServerFn({ method: "GET" }).handler(async () => ({
  stripeReady: Boolean(process.env["STRIPE_SECRET_KEY"]),
  // Publishable key is public by design: Elements needs it in the browser.
  stripePublishableKey: process.env["STRIPE_PUBLISHABLE_KEY"] ?? null,
  bunqReady: Boolean(
    process.env["BUNQ_API_KEY"] &&
    process.env["BUNQ_PRIVATE_KEY"] &&
    process.env["BUNQ_PUBLIC_KEY"],
  ),
}));

/**
 * Live betaalstatus voor asynchrone methodes (Bancontact/iDEAL-redirect,
 * overschrijving, QR).
 *
 * De webhook blijft de bron van waarheid, maar wanneer die vertraagd is of de
 * gebruiker het tabblad sloot, verzoent deze functie de openstaande betaling
 * rechtstreeks bij Stripe: `succeeded` activeert de verificatie (en dus de
 * Brevo-bevestigingsmail in de taal van het lid), `processing` en mislukkingen
 * schrijven hun eigen status + mail weg. De frontend pollt hierop.
 */
export const pollPaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z.object({ paymentId: z.string().uuid().optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { dbAdmin } = await import("@/lib/db/admin.server");
    const base = dbAdmin
      .from("verification_payments")
      .select("id, user_id, status, provider, provider_ref, updated_at, created_at")
      .eq("user_id", context.userId);
    const query = data.paymentId ? base.eq("id", data.paymentId) : base;
    const { data: row } = await query
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!row) return { ok: true as const, status: null, at: null, paid: false as const };

    let status = String(row.status ?? "pending");
    const intentId = String(row.provider_ref ?? "");
    const open = status !== "paid" && status !== "refunded";

    // Alleen Stripe kan server-side bevraagd worden; bunq en SEPA hebben hun
    // eigen kanalen (bunq-polling, bankfeed) en lezen we hier enkel uit.
    if (open && intentId.startsWith("pi_")) {
      try {
        const { readPaymentIntent, activateVerification, markPaymentStatus } =
          await import("./verification.server");
        const intent = await readPaymentIntent(intentId);
        if (intent.status === "succeeded") {
          await activateVerification(String(row.id), intentId);
          status = "paid";
        } else if (intent.status === "processing" && status !== "processing") {
          await markPaymentStatus(String(row.id), "processing", intentId);
          status = "processing";
        } else if (intent.status === "canceled") {
          await markPaymentStatus(String(row.id), "expired", intentId);
          status = "expired";
        } else if (intent.status === "requires_payment_method" && intent.errorCode) {
          await markPaymentStatus(
            String(row.id),
            "failed",
            intentId,
            intent.declineCode ?? intent.errorCode,
          );
          status = "failed";
        }
      } catch (err) {
        console.error("[verification] poll reconcile failed", {
          message: err instanceof Error ? err.message.slice(0, 200) : "poll_failed",
        });
      }
    }

    return {
      ok: true as const,
      status,
      at: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
      paid: status === "paid",
    };
  });
