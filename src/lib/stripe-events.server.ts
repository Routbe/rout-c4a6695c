/**
 * Stripe webhook event router (server-only).
 *
 * Card payments confirm synchronously; SEPA Direct Debit does not — the
 * Checkout Session completes while the debit is still clearing, and Stripe
 * follows up days later with an async event. Entitlements therefore only flip
 * on a *confirmed* charge, never on session completion alone.
 */

type StripeObject = Record<string, unknown>;

export interface StripeEvent {
  id?: string;
  type?: string;
  data?: { object?: StripeObject };
}

/** Events we act on. Anything else is acknowledged and ignored. */
export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "payment_intent.succeeded",
  "payment_intent.processing",
  "payment_intent.canceled",
  "payment_intent.payment_failed",
  "payment_intent.requires_action",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.deleted",
  "charge.refunded",
  "charge.dispute.created",
] as const;

function metadataOf(object: StripeObject | undefined): Record<string, string> {
  const meta = object?.["metadata"];
  return meta && typeof meta === "object" ? (meta as Record<string, string>) : {};
}

/** Finds the payment id wherever this event type carries it. */
function paymentIdOf(event: StripeEvent): string | null {
  const object = event.data?.object;
  const direct = metadataOf(object)["payment_id"];
  if (direct) return direct;

  // Subscription invoices carry it on the subscription's metadata.
  const details = object?.["subscription_details"] as StripeObject | undefined;
  const fromSubscription = metadataOf(details)["payment_id"];
  if (fromSubscription) return fromSubscription;

  const lines = (object?.["lines"] as { data?: StripeObject[] } | undefined)?.data;
  const fromLine = lines?.[0] ? metadataOf(lines[0])["payment_id"] : undefined;
  return fromLine ?? null;
}

function stringOf(object: StripeObject | undefined, key: string): string | null {
  const value = object?.[key];
  return typeof value === "string" ? value : null;
}

/**
 * Applies one verified Stripe event. Returns a short human-readable outcome so
 * the route can answer 200 with a diagnosable body.
 */
export async function applyStripeEvent(event: StripeEvent): Promise<string> {
  const object = event.data?.object ?? {};

  // Makersdonaties lopen buiten de verificatiebetalingen om.
  const meta = metadataOf(object);

  // Paid booking holds (booking engine): confirm on payment, release on expiry.
  if (meta["kind"] === "booking" && meta["booking_id"]) {
    const { confirmPaidBooking, releaseBookingHold } = await import("@/lib/booking-engine/book.server");
    if (event.type === "checkout.session.completed" && object["payment_status"] === "paid") {
      return `booking:${await confirmPaidBooking(meta["booking_id"], String(object["id"] ?? ""))}`;
    }
    if (event.type === "checkout.session.expired") {
      return `booking:${await releaseBookingHold(meta["booking_id"])}`;
    }
    return "booking:ignored";
  }

  // Pro-tier of Root-subdomein add-on gekocht via Checkout: metadata bepaalt
  // welk recht wordt toegekend. Alleen een bevestigde betaling telt.
  const productKind = (meta["product"] ?? meta["kind"] ?? "").toLowerCase();
  if (
    meta["user_id"] &&
    (productKind === "root_subdomain" ||
      productKind === "root_subdomain_addon" ||
      productKind === "root_lifetime" ||
      productKind === "pro_tier")
  ) {
    const paid =
      event.type === "payment_intent.succeeded" ||
      event.type === "checkout.session.async_payment_succeeded" ||
      (event.type === "checkout.session.completed" &&
        ["paid", "no_payment_required"].includes(stringOf(object, "payment_status") ?? "paid"));
    if (!paid) return `${productKind} awaiting payment`;

    const userId = meta["user_id"];
    const isRoot = productKind !== "pro_tier";
    const { sql } = await import("./neon");
    await sql`
      update public.profiles
         set is_paid = true,
             verified = true,
             verified_at = coalesce(verified_at, now()),
             subdomain_enabled = true,
             subdomain_tier = case
               when ${isRoot} then 'root_lifetime'
               when subdomain_tier = 'root_lifetime' then subdomain_tier
               else 'pro' end,
             updated_at = now()
       where id = ${userId}
    `;

    if (isRoot) {
      // Zet root_subdomain_status op pending_dns en verstuurt Brevo #2 (admin)
      // en #3 (lid) via de bestaande claimketen.
      const { claimRootSubdomainFor } = await import("./subdomain.server");
      const claim = await claimRootSubdomainFor(userId);
      return `root subdomain ${claim.status} (${claim.subdomain})`;
    }
    return "pro tier activated";
  }

  // Cadeaubonnen: pas activeren (en factuur + bon mailen) bij bevestigde betaling.
  if (meta["kind"] === "gift_card" && meta["gift_card_id"]) {
    const succeeded =
      event.type === "payment_intent.succeeded" ||
      event.type === "checkout.session.async_payment_succeeded" ||
      (event.type === "checkout.session.completed" &&
        (stringOf(object, "payment_status") ?? "paid") === "paid");
    if (!succeeded) return "gift card awaiting payment";
    const { markGiftCardPaid } = await import("./gift-cards.server");
    const outcome = await markGiftCardPaid({
      giftId: meta["gift_card_id"],
      reference: stringOf(object, "id") ?? event.id ?? null,
    });
    return `gift card ${outcome}`;
  }

  // SecureShield-opwaarderingen: alleen bijschrijven bij een geslaagde betaling.

  if (meta["kind"] === "wallet_topup" && meta["user_id"]) {
    const succeeded =
      event.type === "payment_intent.succeeded" ||
      event.type === "checkout.session.async_payment_succeeded" ||
      (event.type === "checkout.session.completed" &&
        (stringOf(object, "payment_status") ?? "paid") === "paid");
    if (!succeeded) return "wallet topup ignored";
    // Het bedrag komt uit wat Stripe werkelijk int, niet uit metadata alleen:
    // beide moeten exact een staffel (€10/25/50/100/250) in EUR zijn.
    const { verifiedTopupCredit } = await import("./wallet-tiers");
    const isIntent = event.type === "payment_intent.succeeded";
    const amount = verifiedTopupCredit({
      requestedCents: meta["amount_cents"],
      paidCents: (object as Record<string, unknown>)[isIntent ? "amount_received" : "amount_total"],
      currency: (object as Record<string, unknown>)["currency"],
    });
    if (amount === null) {
      console.error("[wallet] topup rejected: paid amount does not match an allowed tier", {
        event: event.id ?? null,
      });
      return "wallet topup rejected";
    }
    // Eén referentie per betaling (PaymentIntent), zodat sessie- en intent-events
    // samen nooit dubbel bijschrijven.
    const paymentRef = isIntent
      ? stringOf(object, "id")
      : (stringOf(object, "payment_intent") ?? stringOf(object, "id"));
    const { creditWallet } = await import("./wallet.server");
    const credited = await creditWallet({
      userId: meta["user_id"],
      amountCents: amount,
      kind: "topup",
      description: "SecureShield opwaardering",
      reference: `stripe:${paymentRef ?? event.id ?? ""}`,
    });
    return credited ? "wallet credited" : "wallet topup duplicate";
  }

  if (meta["kind"] === "creator_donation" && meta["donation_id"]) {
    const { markDonation } = await import("./donations.server");
    const ref = stringOf(object, "id");
    const raw = (object ?? {}) as Record<string, unknown>;
    // What Stripe actually collected; markDonation only flips to `paid` when
    // this equals the server-stored amount in EUR.
    const collected = {
      cents: event.type === "payment_intent.succeeded" ? raw["amount_received"] : raw["amount_total"],
      currency: raw["currency"],
    };
    const paidOutcome = async () =>
      (await markDonation(meta["donation_id"]!, "paid", ref, collected)) === "updated"
        ? "donation paid"
        : "donation rejected";
    switch (event.type) {
      case "checkout.session.completed": {
        const status = stringOf(object, "payment_status");
        if (status !== "paid") {
          await markDonation(meta["donation_id"], "processing", ref);
          return "donation processing";
        }
        return paidOutcome();
      }
      case "checkout.session.async_payment_succeeded":
      case "payment_intent.succeeded":
        return paidOutcome();
      case "payment_intent.processing":
        await markDonation(meta["donation_id"], "processing", ref);
        return "donation processing";
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed":
      case "payment_intent.payment_failed":
      case "payment_intent.canceled":
        await markDonation(meta["donation_id"], "failed", ref);
        return "donation failed";
      default:
        return "donation event ignored";
    }
  }

  // Stripe Connect: de payout-status van een maker bijhouden in Neon.
  if (event.type === "account.updated") {
    const accountId = stringOf(object, "id");
    if (!accountId) return "connect account ignored (no id)";
    const chargesEnabled = object?.["charges_enabled"] === true;
    const payoutsEnabled = object?.["payouts_enabled"] === true;
    const status = chargesEnabled && payoutsEnabled ? "active" : "pending";
    const { sql } = await import("./neon");
    await sql`
      update public.profiles
         set stripe_account_status = ${status},
             stripe_charges_enabled = ${chargesEnabled},
             stripe_payouts_enabled = ${payoutsEnabled},
             updated_at = now()
       where stripe_account_id = ${accountId}
    `;
    return `connect account ${status}`;
  }

  const paymentId = paymentIdOf(event);
  if (!paymentId) return "ignored (no payment reference)";

  const {
    activateVerification,
    markPaymentStatus,
    revokeVerification,
    endRecurringDonation,
    confirmRecurringDonation,
  } = await import("./verification.server");

  // Identiteit telt alleen wanneer de bank de naam bevestigt. Zonder sterke
  // match blijft de betaling `processing` en gaat ze naar handmatige review.
  const { verifyStripePayerName } = await import("./stripe-payer-name.server");
  const activateIfPayerMatches = async (ref: string | null, label: string) => {
    const verdict = await verifyStripePayerName({ paymentId, reference: ref });
    if (!verdict.ok) return `held for review (${verdict.reason})`;
    await activateVerification(paymentId, ref);
    return label;
  };

  switch (event.type) {
    case "checkout.session.completed": {
      const status = stringOf(object, "payment_status");
      const ref = stringOf(object, "id");
      // SEPA: `unpaid`/`processing` here means the debit is still clearing.
      if (status && status !== "paid" && status !== "no_payment_required") {
        await markPaymentStatus(paymentId, "processing", ref);
        return "sepa payment processing";
      }
      return await activateIfPayerMatches(ref, "activated");
    }

    case "checkout.session.async_payment_succeeded": {
      return await activateIfPayerMatches(stringOf(object, "id"), "activated (async)");
    }

    case "checkout.session.async_payment_failed": {
      await markPaymentStatus(paymentId, "failed", stringOf(object, "id"));
      return "async payment failed";
    }

    case "checkout.session.expired": {
      await markPaymentStatus(paymentId, "expired", stringOf(object, "id"));
      return "session expired";
    }

    // Embedded Elements (kaart, Bancontact, iDEAL, Klarna) verlopen zonder
    // Checkout Session: die flow meldt zich uitsluitend via payment_intent.*.
    // Zonder deze takken bleef een geslaagde redirect-betaling onbevestigd —
    // geen activering, geen bevestigingsmail.
    case "payment_intent.succeeded": {
      return await activateIfPayerMatches(stringOf(object, "id"), "activated (payment_intent)");
    }

    case "payment_intent.processing": {
      await markPaymentStatus(paymentId, "processing", stringOf(object, "id"));
      return "payment processing";
    }

    case "payment_intent.canceled": {
      await markPaymentStatus(paymentId, "failed", stringOf(object, "id"), "canceled");
      return "payment canceled";
    }

    case "payment_intent.payment_failed": {
      const declineCode =
        stringOf(object, "last_payment_error[decline_code]") ??
        ((object?.["last_payment_error"] as StripeObject | undefined)?.["decline_code"] as
          string | undefined);
      const message =
        stringOf(object, "last_payment_error[message]") ??
        ((object?.["last_payment_error"] as StripeObject | undefined)?.["message"] as
          string | undefined);
      const reason = [declineCode, message].filter(Boolean).join(" — ") || "payment_failed";
      await markPaymentStatus(paymentId, "incomplete", stringOf(object, "id"), reason);
      return `payment incomplete (${reason})`;
    }

    case "payment_intent.requires_action": {
      await markPaymentStatus(paymentId, "incomplete", stringOf(object, "id"), "requires_action");
      return "payment requires customer action";
    }

    case "invoice.paid": {
      await confirmRecurringDonation(paymentId);
      return "donation renewed";
    }

    case "invoice.payment_failed": {
      await markPaymentStatus(paymentId, "failed", stringOf(object, "id"));
      return "invoice payment failed";
    }

    case "customer.subscription.deleted": {
      await endRecurringDonation(paymentId);
      return "donation cancelled";
    }

    case "charge.refunded":
    case "charge.dispute.created": {
      await revokeVerification(
        paymentId,
        event.type === "charge.refunded" ? "refund" : "chargeback",
      );
      return "revoked";
    }

    default:
      return "ignored";
  }
}
