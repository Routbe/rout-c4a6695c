/**
 * Server-only logica voor makersdonaties (`/u/<handle>/donate`).
 *
 * De rij in `public.creator_donations` wordt aangemaakt vóór de Stripe-checkout
 * en pas door de webhook op `paid` gezet: een afgebroken betaling telt nooit
 * mee. Alleen geverifieerde/betalende leden kunnen steun ontvangen.
 */
import { sql } from "@/lib/neon";
import { sendDonationReceipt } from "@/lib/brevo/client";

type Row = Record<string, unknown>;

export {
  DONATION_PRESETS,
  MIN_DONATION_CENTS,
  MAX_DONATION_CENTS,
} from "@/lib/payment-amount-policy";

export type DonationTarget = {
  creatorId: string;
  handle: string;
  displayName: string | null;
  tagline: string | null;
  avatarUrl: string | null;
  verified: boolean;
  badgeVisible: boolean;
  badgeType: string;
  badgeNameFormat: string;
  legalName: string | null;
};

const clean = (raw: string) => raw.replace(/^@+/, "").trim().toLowerCase();

/** Leest de maker achter een handle. `null` als er geen donaties mogelijk zijn. */
export async function readDonationTarget(rawHandle: string): Promise<DonationTarget | null> {
  const handle = clean(rawHandle);
  if (!handle || !/^[a-z0-9._-]{2,40}$/.test(handle)) return null;

  let rows: Row[] = [];
  try {
    rows = (await sql`
      select id, username, display_name, tagline, avatar_url, verified, is_paid,
             is_early_believer, status, is_banned, is_suspended, verified_legal_name,
             to_jsonb(profiles) -> 'display_prefs' as display_prefs
        from public.profiles
       where username = ${handle}
       limit 1
    `) as Row[];
  } catch {
    return null;
  }

  const profile = rows[0];
  if (!profile) return null;

  const entitled =
    (profile["verified"] === true ||
      profile["is_paid"] === true ||
      profile["is_early_believer"] === true) &&
    profile["status"] !== "banned" &&
    profile["status"] !== "suspended" &&
    profile["is_banned"] !== true &&
    profile["is_suspended"] !== true;
  if (!entitled) return null;

  const { parseDisplayPrefs } = await import("./profile-display");
  const prefs = parseDisplayPrefs(profile["display_prefs"]);
  // A profile the member set to private gets no public donation page either.
  if (!prefs.publicProfile) return null;
  const { publicBadgeKind } = await import("./badge-rules");
  const badge = publicBadgeKind({
    verified: profile["verified"] === true,
    isBusiness: false,
    isInfluencer: false,
    badgeVisible: prefs.badgeVisible,
    badgeType: prefs.badgeType,
  });

  return {
    creatorId: String(profile["id"]),
    handle,
    displayName: (profile["display_name"] as string | null) ?? null,
    tagline: (profile["tagline"] as string | null) ?? null,
    avatarUrl: (profile["avatar_url"] as string | null) ?? null,
    verified: profile["verified"] === true,
    badgeVisible: prefs.badgeVisible,
    badgeType: prefs.badgeType,
    badgeNameFormat: prefs.badgeNameFormat,
    // Only shared with the blue verified badge; the privacy shield never reveals the legal name.
    legalName: badge === "verified" ? ((profile["verified_legal_name"] as string | null) ?? null) : null,
  };
}

export type StartDonationResult =
  | { ok: true; url: string; donationId: string }
  | {
      ok: false;
      reason: "unknown_creator" | "invalid_amount" | "stripe_not_configured" | "failed";
      detail?: string;
    };

/** Maakt de donatierij + de Stripe Checkout-sessie. */
export async function startDonation(opts: {
  handle: string;
  amountCents: number;
  message: string | null;
  supporterName: string | null;
  supporterEmail: string | null;
  origin: string;
}): Promise<StartDonationResult> {
  const target = await readDonationTarget(opts.handle);
  if (!target) return { ok: false, reason: "unknown_creator" };

  // The charged amount is decided by the server-side policy (presets, or a
  // custom amount inside the platform range on the 50-cent grid); the
  // request only proposes it. The webhook later re-checks Stripe's collected
  // amount against this stored value before marking the donation paid.
  const { resolveDonationAmount } = await import("./payment-amount-policy");
  const amount = resolveDonationAmount(opts.amountCents);
  if (amount === null) return { ok: false, reason: "invalid_amount" };

  const { stripeKey } = await import("./verification.server");
  const key = stripeKey();
  if (!key) return { ok: false, reason: "stripe_not_configured" };

  let donationId: string;
  try {
    const inserted = (await sql`
      insert into public.creator_donations
        (creator_id, handle, amount_cents, message, supporter_name, supporter_email)
      values (${target.creatorId}, ${target.handle}, ${amount}, ${opts.message},
              ${opts.supporterName}, ${opts.supporterEmail})
      returning id
    `) as Row[];
    donationId = String(inserted[0]?.["id"]);
  } catch (error) {
    return {
      ok: false,
      reason: "failed",
      detail: error instanceof Error ? error.message : "insert_failed",
    };
  }

  const origin = opts.origin.replace(/\/$/, "");
  const back = `${origin}/u/${encodeURIComponent(target.handle)}/donate`;
  const body = new URLSearchParams({
    mode: "payment",
    success_url: `${back}?donation=${donationId}&status=success`,
    cancel_url: `${back}?donation=${donationId}&status=cancel`,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(amount),
    "line_items[0][price_data][product_data][name]": `Steun @${target.handle}`,
    // Apple Pay / Google Pay / Bancontact / iDEAL / kaart volgen de
    // betaalmethodes die in het Stripe-dashboard actief staan.
    "automatic_tax[enabled]": "false",
    "metadata[kind]": "creator_donation",
    "metadata[donation_id]": donationId,
    "metadata[creator_id]": target.creatorId,
    "metadata[handle]": target.handle,
    "payment_intent_data[metadata][kind]": "creator_donation",
    "payment_intent_data[metadata][donation_id]": donationId,
    "payment_intent_data[description]": `ROUT donatie aan @${target.handle}`,
  });
  if (opts.supporterEmail) body.set("customer_email", opts.supporterEmail);

  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const json = (await res.json()) as { id?: string; url?: string; error?: { message?: string } };
    if (!res.ok || !json.url) {
      await markDonation(donationId, "failed", null).catch(() => undefined);
      return { ok: false, reason: "failed", detail: json.error?.message ?? `HTTP ${res.status}` };
    }
    if (json.id) {
      try {
        await sql`update public.creator_donations set session_id = ${json.id} where id = ${donationId}`;
      } catch {
        /* de webhook vindt de rij ook via metadata */
      }
    }
    return { ok: true, url: json.url, donationId };
  } catch (error) {
    return {
      ok: false,
      reason: "failed",
      detail: error instanceof Error ? error.message : "stripe_failed",
    };
  }
}

/** Zet de status van één donatie (webhook + annulering). */
export async function markDonation(
  donationId: string,
  status: "paid" | "failed" | "expired" | "processing",
  sessionId: string | null,
  /** Required for `paid`: what Stripe actually collected. */
  collected?: { cents: unknown; currency: unknown },
): Promise<"updated" | "amount_mismatch" | "not_found"> {
  if (status === "paid") {
    const current = (await sql`
      select amount_cents from public.creator_donations where id = ${donationId} limit 1
    `) as Row[];
    if (!current[0]) return "not_found";
    const { donationPaymentMatches } = await import("./payment-amount-policy");
    if (!collected || !donationPaymentMatches(Number(current[0]["amount_cents"]), collected.cents, collected.currency)) {
      console.error("[donations] paid event rejected: collected amount does not match the stored donation", {
        donationId,
      });
      return "amount_mismatch";
    }
  }
  const updated = (await sql`
    update public.creator_donations
       set status = ${status},
           session_id = coalesce(${sessionId}, session_id),
           paid_at = case when ${status} = 'paid' then now() else paid_at end
     where id = ${donationId}
     returning handle, amount_cents, message, supporter_name, supporter_email
  `) as Row[];
  if (!updated[0]) return "not_found";

  // Ontvangstbewijs naar de supporter zodra de betaling rond is.
  const row = updated[0];
  const supporterEmail = (row?.["supporter_email"] as string | null) ?? null;
  if (status === "paid" && supporterEmail) {
    await sendDonationReceipt({
      to: supporterEmail,
      supporterName: (row?.["supporter_name"] as string | null) ?? null,
      creatorHandle: String(row?.["handle"] ?? ""),
      amountCents: Number(row?.["amount_cents"] ?? 0),
      message: (row?.["message"] as string | null) ?? null,
    }).catch(() => undefined);
  }
  return "updated";
}

export type DonationStatus = {
  status: string;
  handle: string;
};

export async function readDonationStatus(donationId: string): Promise<DonationStatus | null> {
  if (!/^[0-9a-f-]{36}$/i.test(donationId)) return null;
  try {
    const rows = (await sql`
      select status, handle
        from public.creator_donations where id = ${donationId} limit 1
    `) as Row[];
    const row = rows[0];
    if (!row) return null;
    return {
      status: String(row["status"]),
      handle: String(row["handle"]),
    };
  } catch {
    return null;
  }
}

export type DonationSummary = {
  totalCents: number;
  count: number;
  recent: {
    id: string;
    amountCents: number;
    message: string | null;
    supporterName: string | null;
    createdAt: string;
  }[];
};

/** Overzicht voor de studio van de maker zelf. */
export async function readMyDonations(userId: string): Promise<DonationSummary> {
  const empty: DonationSummary = { totalCents: 0, count: 0, recent: [] };
  try {
    const totals = (await sql`
      select coalesce(sum(amount_cents), 0)::int as total, count(*)::int as n
        from public.creator_donations
       where creator_id = ${userId} and status = 'paid'
    `) as Row[];
    const rows = (await sql`
      select id, amount_cents, message, supporter_name, created_at
        from public.creator_donations
       where creator_id = ${userId} and status = 'paid'
       order by created_at desc
       limit 10
    `) as Row[];
    return {
      totalCents: Number(totals[0]?.["total"] ?? 0),
      count: Number(totals[0]?.["n"] ?? 0),
      recent: rows.map((row) => ({
        id: String(row["id"]),
        amountCents: Number(row["amount_cents"] ?? 0),
        message: (row["message"] as string | null) ?? null,
        supporterName: (row["supporter_name"] as string | null) ?? null,
        createdAt: String(row["created_at"]),
      })),
    };
  } catch {
    // Tabel bestaat nog niet (migratie 19 niet gedraaid): leeg tonen i.p.v. crashen.
    return empty;
  }
}
