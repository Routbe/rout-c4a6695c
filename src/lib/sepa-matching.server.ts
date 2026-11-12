/**
 * Fail-safe matching for manual SEPA transfers.
 *
 * Manual bank transfers are typed by humans, so a strict "reference must match"
 * rule silently strands real payments. The matcher therefore grades every
 * inbound bank notification:
 *
 *   Level 1 — Perfect match: amount *and* reference line up → activate at once.
 *   Level 2 — Partial match: amount lines up, reference missing/unknown →
 *             e-mail the payer a short form so they can supply the reference.
 *   Level 3 — Alert: nothing lines up → logged as "Review Required" for admins.
 */
import { parseAllRoutReferences, parseAmountCents, parseRoutReference } from "./reference-parser";
import { extractPayerName, matchPayerName } from "./sepa-name-match";
import { queueSepaReview } from "./sepa-review.server";

export type MatchLevel = 1 | 2 | 3;

export interface MatchOutcome {
  level: MatchLevel;
  reference: string | null;
  amountCents: number | null;
  paymentId?: string;
  activated?: boolean;
  reason: string;
  /** Level 2b only: fuzzy payer-name similarity, 0…1. */
  nameScore?: number;
}

interface PaymentRow {
  id: string;
  user_id: string;
  tier: string;
  status: string;
  amount_cents: number | null;
  donation_cents: number | null;
  reference_code: string | null;
}

function expectedCents(payment: PaymentRow): number {
  return (payment.amount_cents ?? 0) + (payment.donation_cents ?? 0);
}

/**
 * Records every inbound bank notification in `webhook_events` so it shows up
 * in the admin "Inbound Payments" queue — matched or not. Unmatched/mistyped
 * references land as `inbound:UNMATCHED-<timestamp>` so an admin can still
 * link them to the right member with one click.
 */
async function recordInboundEvent(reference: string | null): Promise<void> {
  try {
    const { dbAdmin } = await import("@/lib/db/admin.server");
    const id = reference
      ? `inbound:${reference}`
      : `inbound:UNMATCHED-${Date.now().toString(36).toUpperCase()}`;
    const { error } = await dbAdmin.from("webhook_events").insert({
      id,
      source: "banking",
      kind: "payment_email",
    });
    // 23505 = same reference already logged; the queue only needs one row.
    if (error && error.code !== "23505") console.error("[sepa-match] event log failed", error);
  } catch (error) {
    console.error("[sepa-match] event log threw", error);
  }
}

/** Grades and settles one inbound bank notification. */
export async function matchInboundPayment(text: string): Promise<MatchOutcome> {
  const reference = parseRoutReference(text);
  const amountCents = parseAmountCents(text);
  const { dbAdmin } = await import("@/lib/db/admin.server");

  console.info("[sepa-match] inbound", { reference, amountCents, length: text.length });
  await recordInboundEvent(reference);

  let payment: PaymentRow | null = null;
  if (reference) {
    const { data } = await dbAdmin
      .from("verification_payments")
      .select("id, user_id, tier, status, amount_cents, donation_cents, reference_code")
      .eq("reference_code", reference)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    payment = (data as PaymentRow | null) ?? null;
  }

  // ---- Level 1: reference resolves and the amount is right (or absent). ----
  if (payment) {
    const expected = expectedCents(payment);
    const amountOk = amountCents === null || amountCents >= expected;
    if (amountOk) {
      if (payment.status === "paid") {
        return {
          level: 1,
          reference,
          amountCents,
          paymentId: payment.id,
          activated: false,
          reason: "already_paid",
        };
      }
      // De naam die de bank ons doorgeeft is leidend — niet wat het lid zelf
      // invulde. Komt die niet overeen, dan activeren we niets en krijgt het
      // lid een mail terwijl een mens de overschrijving nakijkt.
      const payerName = extractPayerName(text);
      const holderName = await accountHolderName(payment.user_id);
      const nameMatch = payerName ? matchPayerName(payerName, holderName) : null;
      if (nameMatch && nameMatch.verdict !== "strong") {
        await dbAdmin
          .from("verification_payments")
          .update({ status: "processing" })
          .eq("id", payment.id);
        await queueSepaReview({
          paymentId: payment.id,
          userId: payment.user_id,
          reference,
          amountCents,
          expectedCents: expected,
          payerName,
          holderName,
          matchScore: nameMatch.score,
          reason: "name_mismatch",
        });
        await notifyNameMismatch(payment, amountCents ?? expected, payerName);
        await logReview(payment.user_id, reference, amountCents, expected, "name_mismatch");
        await alertAdmin("name_mismatch", {
          reference,
          amountCents,
          expected,
          userId: payment.user_id,
          payerName,
          holderName,
          score: nameMatch.score,
        });
        return {
          level: 2,
          reference,
          amountCents,
          paymentId: payment.id,
          activated: false,
          reason: "name_mismatch",
          nameScore: nameMatch.score,
        };
      }

      await activate(payment, reference!, amountCents, payerName);
      return {
        level: 1,
        reference,
        amountCents,
        paymentId: payment.id,
        activated: true,
        reason: "perfect_match",
      };
    }

    // Reference is right but the money is short — never auto-activate.
    await logReview(payment.user_id, reference, amountCents, expected, "amount_mismatch");
    await alertAdmin("amount_mismatch", {
      reference,
      amountCents,
      expected,
      userId: payment.user_id,
    });
    return {
      level: 3,
      reference,
      amountCents,
      paymentId: payment.id,
      activated: false,
      reason: "amount_mismatch",
    };
  }

  // ---- Level 2: amount matches exactly one pending transfer. ----
  if (amountCents !== null) {
    const { data } = await dbAdmin
      .from("verification_payments")
      .select("id, user_id, tier, status, amount_cents, donation_cents, reference_code")
      .eq("provider", "sepa")
      .neq("status", "paid")
      .order("created_at", { ascending: false })
      .limit(50);

    const candidates = ((data as PaymentRow[] | null) ?? []).filter(
      (row) => expectedCents(row) === amountCents,
    );

    if (candidates.length === 1) {
      const candidate = candidates[0]!;
      await dbAdmin
        .from("verification_payments")
        .update({ status: "processing" })
        .eq("id", candidate.id);

      // ---- Level 2b: right amount, different payer name. ----
      const payerName = extractPayerName(text);
      const holderName = await accountHolderName(candidate.user_id);
      const nameMatch = payerName ? matchPayerName(payerName, holderName) : null;

      if (nameMatch && nameMatch.verdict !== "strong") {
        await queueSepaReview({
          paymentId: candidate.id,
          userId: candidate.user_id,
          reference: parseAllRoutReferences(text)[0] ?? reference,
          amountCents,
          expectedCents: expectedCents(candidate),
          payerName,
          holderName,
          matchScore: nameMatch.score,
          reason: "name_mismatch",
        });
        await notifyNameMismatch(candidate, amountCents, payerName);
        await logReview(
          candidate.user_id,
          reference,
          amountCents,
          expectedCents(candidate),
          "name_mismatch",
        );
        await alertAdmin("name_mismatch", {
          reference,
          amountCents,
          expected: expectedCents(candidate),
          userId: candidate.user_id,
          payerName,
          holderName,
          score: nameMatch.score,
        });
        return {
          level: 2,
          reference,
          amountCents,
          paymentId: candidate.id,
          activated: false,
          reason: "name_mismatch",
          nameScore: nameMatch.score,
        };
      }

      await sendIncompletePaymentEmail(candidate, amountCents);
      await logReview(
        candidate.user_id,
        parseAllRoutReferences(text)[0] ?? null,
        amountCents,
        expectedCents(candidate),
        "missing_reference",
      );
      return {
        level: 2,
        reference,
        amountCents,
        paymentId: candidate.id,
        activated: false,
        reason: "missing_reference",
        ...(nameMatch ? { nameScore: nameMatch.score } : {}),
      };
    }
  }

  // ---- Level 3: nothing to go on. ----
  await logReview(null, reference, amountCents, null, "no_match");
  await alertAdmin("no_match", { reference, amountCents, expected: null, userId: null });
  return { level: 3, reference, amountCents, activated: false, reason: "no_match" };
}

/** Level 3: a human has to look at this transfer — mail the admin block (#1). */
async function alertAdmin(
  reason: string,
  info: {
    reference: string | null;
    amountCents: number | null;
    expected: number | null;
    userId: string | null;
    payerName?: string | null;
    holderName?: string | null;
    score?: number;
  },
): Promise<void> {
  try {
    const { notifyAdmin } = await import("./notifications.server");
    const money = (cents: number | null) =>
      cents === null ? "onbekend" : `${(cents / 100).toFixed(2)} EUR`;
    await notifyAdmin({
      subject: `[ROUT] SEPA review vereist — ${reason}`,
      message:
        `Een inkomende overschrijving kon niet automatisch gekoppeld worden (${reason}). ` +
        `Ontvangen ${money(info.amountCents)}${
          info.expected === null ? "" : `, verwacht ${money(info.expected)}`
        }. Referentie: ${info.reference ?? "geen"}.`,
      params: {
        REASON: reason,
        PAYER_NAME: info.payerName ?? "",
        HOLDER_NAME: info.holderName ?? "",
        MATCH_SCORE: info.score === undefined ? "" : info.score.toFixed(2),
        REFERENCE: info.reference ?? "",
        AMOUNT: money(info.amountCents),
        EXPECTED: money(info.expected),
        USER_ID: info.userId ?? "",
      },
      tags: ["sepa-review"],
    });
  } catch (error) {
    console.error("[sepa-match] admin alert failed", error);
  }
}

/**
 * Settles one pending SEPA payment by id — used by the admin review queue when
 * a level 2b name mismatch is approved by a human.
 */
export async function settleSepaPayment(
  paymentId: string,
  reference: string | null,
  amountCents: number | null,
): Promise<boolean> {
  try {
    const { dbAdmin } = await import("@/lib/db/admin.server");
    const { data } = await dbAdmin
      .from("verification_payments")
      .select("id, user_id, tier, status, amount_cents, donation_cents, reference_code")
      .eq("id", paymentId)
      .maybeSingle();
    const payment = (data as PaymentRow | null) ?? null;
    if (!payment) return false;
    if (payment.status === "paid") return false;
    await activate(payment, reference ?? payment.reference_code ?? "manual-review", amountCents);
    return true;
  } catch (error) {
    console.error("[sepa-review] settle failed", error);
    return false;
  }
}

/** The display name we compare an inbound payer name against. */
async function accountHolderName(userId: string): Promise<string | null> {
  try {
    const { dbAdmin } = await import("@/lib/db/admin.server");
    const { data } = await dbAdmin
      .from("profiles")
      .select("verified_legal_name, display_name, full_name" as "*")
      .eq("id", userId)
      .maybeSingle();
    const row = (data ?? null) as Record<string, unknown> | null;
    return (
      ((row?.["verified_legal_name"] as string | null) ??
        (row?.["display_name"] as string | null) ??
        (row?.["full_name"] as string | null)) ||
      null
    );
  } catch {
    return null;
  }
}

/** Level 2b: tell the member a human is checking their transfer. */
async function notifyNameMismatch(
  payment: PaymentRow,
  amountCents: number,
  payerName: string | null,
): Promise<void> {
  try {
    const origin = (process.env["PUBLIC_SITE_URL"] ?? "https://rout.be").replace(/\/$/, "");
    const { notifyUser } = await import("./notifications.server");
    await notifyUser(
      payment.user_id,
      "transfer_name_mismatch",
      { payment_id: payment.id, amount_cents: amountCents, payer_name: payerName },
      {
        REFERENCE: payment.reference_code ?? "",
        AMOUNT: `€${(amountCents / 100).toFixed(2).replace(".", ",")}`,
        PAYER_NAME: payerName ?? "",
        CTA_URL: `${origin}/dashboard?verification=review`,
      },
    );
  } catch (error) {
    console.error("[sepa-match] level 2b notify failed", error);
  }
}

/** Level 1 settlement: money confirmed, badge and alias go live immediately. */
async function activate(
  payment: PaymentRow,
  reference: string,
  amountCents: number | null,
  payerName?: string | null,
) {
  const { dbAdmin } = await import("@/lib/db/admin.server");

  await dbAdmin
    .from("verification_payments")
    .update({ status: "paid", provider_ref: reference })
    .eq("id", payment.id);

  await dbAdmin
    .from("profiles")
    .update({
      is_paid: true,
      is_early_believer: true,
      payment_method: "bank_transfer_automatic",
      tier: payment.tier,
      verified: true,
      status: "active",
      verified_at: new Date().toISOString(),
      // De naam zoals de bank hem doorgaf is de bron van waarheid voor het
      // blauwe vinkje; wat het lid zelf typte gebruiken we nooit als bewijs.
      ...(payerName ? { verified_legal_name: payerName } : {}),
    })
    .eq("id", payment.user_id);

  await dbAdmin.from("admin_audit_log").insert({
    admin_id: payment.user_id,
    admin_email: "system@rout.be",
    action: "AUTO_PAYMENT_VERIFIED",
    target_user_id: payment.user_id,
    target_label: reference,
    notes: `Reference: ${reference} — automatic bank transfer match (level 1, ${
      amountCents === null ? "amount unknown" : `${(amountCents / 100).toFixed(2)} EUR`
    }).`,
  });

  await dbAdmin.from("security_events").insert({
    user_id: payment.user_id,
    kind: "verification_activated",
    severity: "info",
    message: `Payment auto-verified from bank e-mail (${reference}).`,
    details: { payment_id: payment.id, reference, level: 1, amount_cents: amountCents },
  });

  console.info("[sepa-match] level 1 activated", { paymentId: payment.id, reference });

  try {
    const { notifyUser } = await import("./notifications.server");
    await notifyUser(payment.user_id, "payment_succeeded", { payment_id: payment.id });
  } catch (error) {
    console.error("[sepa-match] notify failed", error);
  }

  try {
    const { drainAliasSyncQueue } = await import("./alias-sync.server");
    await drainAliasSyncQueue(5);
  } catch (error) {
    console.error("[sepa-match] alias drain failed", error);
  }
}

/**
 * Level 2: ask the payer for the missing reference.
 *
 * Goes through `notifyUser` so the member also gets the in-app row and the
 * mail lands in their own language (transfer block, base 52) with the inline
 * HTML as the last-resort fallback.
 */
async function sendIncompletePaymentEmail(payment: PaymentRow, amountCents: number) {
  try {
    const reference = payment.reference_code ?? "";
    const origin = process.env["PUBLIC_SITE_URL"] ?? "https://rout.be";
    const link = `${origin.replace(/\/$/, "")}/dashboard?verification=reference&ref=${encodeURIComponent(
      reference,
    )}`;
    const amount = `€${(amountCents / 100).toFixed(2).replace(".", ",")}`;

    const { notifyUser } = await import("./notifications.server");
    await notifyUser(
      payment.user_id,
      "transfer_received_unmatched",
      { payment_id: payment.id, reference, amount_cents: amountCents },
      {
        REFERENCE: reference,
        AMOUNT: amount,
        AMOUNT_CENTS: amountCents,
        CTA_URL: link,
        CONFIRM_URL: link,
      },
    );
    console.info("[sepa-match] level 2 unmatched-transfer notification", {
      paymentId: payment.id,
    });
  } catch (error) {
    console.error("[sepa-match] level 2 mail failed", error);
  }
}

/** Level 2/3 bookkeeping: shows up in the admin dashboard as "Review required". */
async function logReview(
  userId: string | null,
  reference: string | null,
  amountCents: number | null,
  expected: number | null,
  reason: string,
) {
  try {
    const { dbAdmin } = await import("@/lib/db/admin.server");
    await dbAdmin.from("admin_audit_log").insert({
      admin_id: userId ?? "00000000-0000-0000-0000-000000000000",
      admin_email: "system@rout.be",
      action: "PAYMENT_REVIEW_REQUIRED",
      target_user_id: userId,
      target_label: reference ?? "unknown",
      notes: `Review required (${reason}) — received ${
        amountCents === null ? "unknown amount" : `${(amountCents / 100).toFixed(2)} EUR`
      }${expected === null ? "" : `, expected ${(expected / 100).toFixed(2)} EUR`}.`,
    });
    console.warn("[sepa-match] review required", { reason, reference, amountCents, expected });
  } catch (error) {
    console.error("[sepa-match] review log failed", error);
  }
}
