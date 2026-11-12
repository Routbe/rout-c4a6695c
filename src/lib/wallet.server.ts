/** Server-only logica voor de ROUT SecureShield™ prepaid wallet. */
import { sql } from "@/lib/neon";
import {
  WALLET_TOPUP_MAX_CENTS,
  WALLET_TOPUP_MIN_CENTS,
  isWalletTopupTier,
  normaliseAutoTopupCents,
} from "@/lib/wallet-tiers";

type Row = Record<string, unknown>;

/** Maandelijkse relaykost per actieve SecureShield-relay. */
export const RELAY_MONTHLY_CENTS = 9;
/** Opwaarderen kan alleen via de vaste staffel (€10–€250). */
export const MIN_TOPUP_CENTS = WALLET_TOPUP_MIN_CENTS;
export const MAX_TOPUP_CENTS = WALLET_TOPUP_MAX_CENTS;
/** Onder deze grens tonen we een waarschuwing in de studio. */
export const LOW_BALANCE_CENTS = 50;

export type WalletState = {
  balanceCents: number;
  autoTopup: boolean;
  autoTopupCents: number;
  lastChargedOn: string | null;
  lowBalance: boolean;
  minTopupCents: number;
  relayMonthlyCents: number;
  transactions: WalletTransaction[];
};

export type WalletTransaction = {
  id: string;
  kind: string;
  amountCents: number;
  description: string | null;
  createdAt: string;
};

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function ensureWallet(userId: string): Promise<void> {
  await sql`
    insert into public.wallets (user_id) values (${userId})
    on conflict (user_id) do nothing
  `;
}

export async function readWallet(userId: string): Promise<WalletState> {
  await ensureWallet(userId);
  const rows = (await sql`
    select balance_cents, auto_topup, auto_topup_cents, last_charged_on
      from public.wallets where user_id = ${userId} limit 1
  `) as Row[];
  const row = rows[0] ?? {};
  const txRows = (await sql`
    select id, kind, amount_cents, description, created_at
      from public.wallet_transactions
     where user_id = ${userId}
     order by created_at desc
     limit 20
  `) as Row[];

  const balanceCents = num(row["balance_cents"]);
  return {
    balanceCents,
    autoTopup: Boolean(row["auto_topup"]),
    autoTopupCents: num(row["auto_topup_cents"], 500),
    lastChargedOn: row["last_charged_on"] ? String(row["last_charged_on"]) : null,
    lowBalance: balanceCents < LOW_BALANCE_CENTS,
    minTopupCents: MIN_TOPUP_CENTS,
    relayMonthlyCents: RELAY_MONTHLY_CENTS,
    transactions: txRows.map((t) => ({
      id: String(t["id"]),
      kind: String(t["kind"]),
      amountCents: num(t["amount_cents"]),
      description: t["description"] ? String(t["description"]) : null,
      createdAt: String(t["created_at"]),
    })),
  };
}

export async function setAutoTopup(
  userId: string,
  enabled: boolean,
  amountCents: number,
): Promise<void> {
  if (!isWalletTopupTier(amountCents)) throw new Error("invalid_topup_amount");
  const amount = amountCents;
  await ensureWallet(userId);
  await sql`
    update public.wallets
       set auto_topup = ${enabled}, auto_topup_cents = ${amount}, updated_at = now()
     where user_id = ${userId}
  `;
}

/**
 * Schrijft een bedrag bij via de atomaire `wallet_credit`-functie: grootboek en
 * saldo muteren in één transactie met rijvergrendeling. `reference` is
 * idempotent (unieke index), zodat een herhaalde Stripe-webhook nooit dubbel
 * crediteert.
 */
export async function creditWallet(opts: {
  userId: string;
  amountCents: number;
  kind?: "topup" | "refund" | "adjustment";
  description?: string | null;
  reference?: string | null;
}): Promise<boolean> {
  if ((opts.kind ?? "topup") === "topup" && !isWalletTopupTier(opts.amountCents)) return false;
  const amount = Math.max(0, Math.round(opts.amountCents));
  if (!amount) return false;
  await ensureWallet(opts.userId);

  const before = (await sql`
    select balance_cents from public.wallets where user_id = ${opts.userId} limit 1
  `) as Row[];
  const previous = num(before[0]?.["balance_cents"]);

  try {
    const rows = (await sql`
      select public.wallet_credit(
        ${opts.userId}::uuid, ${amount}::int, ${opts.kind ?? "topup"},
        ${opts.description ?? null}, ${opts.reference ?? null}
      ) as balance_cents
    `) as Row[];
    return num(rows[0]?.["balance_cents"], previous) > previous;
  } catch {
    return false;
  }
}

/** Trekt een bedrag af zolang het saldo toereikend is (atomair, server-side). */
export async function debitWallet(opts: {
  userId: string;
  amountCents: number;
  description?: string | null;
  reference?: string | null;
}): Promise<{ ok: boolean; balanceCents: number }> {
  const amount = Math.max(0, Math.round(opts.amountCents));
  await ensureWallet(opts.userId);
  try {
    const rows = (await sql`
      select public.wallet_debit(
        ${opts.userId}::uuid, ${amount}::int,
        ${opts.description ?? null}, ${opts.reference ?? null}
      ) as balance_cents
    `) as Row[];
    const balance = num(rows[0]?.["balance_cents"], -1);
    if (balance < 0) {
      const current = (await sql`
        select balance_cents from public.wallets where user_id = ${opts.userId} limit 1
      `) as Row[];
      return { ok: false, balanceCents: num(current[0]?.["balance_cents"]) };
    }
    return { ok: true, balanceCents: balance };
  } catch {
    const current = (await sql`
      select balance_cents from public.wallets where user_id = ${opts.userId} limit 1
    `) as Row[];
    return { ok: false, balanceCents: num(current[0]?.["balance_cents"]) };
  }
}

/** Heeft de gebruiker genoeg saldo om een relay te activeren/behouden? */
export async function canFundRelay(userId: string): Promise<boolean> {
  const wallet = await readWallet(userId);
  return wallet.balanceCents >= RELAY_MONTHLY_CENTS;
}

/**
 * Maandelijkse afschrijving voor elke gebruiker met een actieve relay. Idempotent
 * per kalendermaand via `last_charged_on` en de referentiesleutel.
 */
export async function chargeMonthlyRelays(): Promise<{
  charged: number;
  skipped: number;
  insufficient: number;
}> {
  const period = new Date().toISOString().slice(0, 7); // YYYY-MM
  let rows: Row[] = [];
  try {
    rows = (await sql`
      select w.user_id, w.balance_cents, w.last_charged_on
        from public.wallets w
       where exists (
         select 1 from public.email_aliases a
          where a.user_id = w.user_id and a.status = 'active'
       )
    `) as Row[];
  } catch {
    // Geen aliastabel (of andere naam): dan valt er niets af te schrijven.
    return { charged: 0, skipped: 0, insufficient: 0 };
  }

  let charged = 0;
  let skipped = 0;
  let insufficient = 0;
  for (const row of rows) {
    const userId = String(row["user_id"]);
    const last = row["last_charged_on"] ? String(row["last_charged_on"]).slice(0, 7) : null;
    if (last === period) {
      skipped += 1;
      continue;
    }
    const result = await debitWallet({
      userId,
      amountCents: RELAY_MONTHLY_CENTS,
      description: `SecureShield relay ${period}`,
      reference: `relay:${userId}:${period}`,
    });
    if (!result.ok) {
      insufficient += 1;
      continue;
    }
    await sql`
      update public.wallets set last_charged_on = current_date, updated_at = now()
       where user_id = ${userId}
    `;
    charged += 1;
  }
  return { charged, skipped, insufficient };
}

/** Stripe Checkout voor het opwaarderen van de wallet. */
export async function startWalletTopup(opts: {
  userId: string;
  email?: string | null;
  amountCents: number;
  origin: string;
}): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  if (!isWalletTopupTier(opts.amountCents)) return { ok: false, reason: "invalid_topup_amount" };
  const { stripeKey } = await import("./verification.server");
  const key = stripeKey();
  if (!key) return { ok: false, reason: "stripe_not_configured" };

  const amount = opts.amountCents;
  const origin = opts.origin.replace(/\/$/, "");
  const body = new URLSearchParams({
    mode: "payment",
    success_url: `${origin}/dashboard?wallet=success`,
    cancel_url: `${origin}/dashboard?wallet=cancel`,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(amount),
    "line_items[0][price_data][product_data][name]": "ROUT SecureShield tegoed",
    "metadata[kind]": "wallet_topup",
    "metadata[user_id]": opts.userId,
    "metadata[amount_cents]": String(amount),
    "payment_intent_data[metadata][kind]": "wallet_topup",
    "payment_intent_data[metadata][user_id]": opts.userId,
    "payment_intent_data[metadata][amount_cents]": String(amount),
    "payment_intent_data[description]": "ROUT SecureShield tegoed",
  });
  if (opts.email) body.set("customer_email", opts.email);

  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const json = (await res.json()) as { url?: string; error?: { message?: string } };
    if (!res.ok || !json.url) {
      console.error("[wallet] checkout provider rejected", { status: res.status });
      return { ok: false, reason: "Er is een tijdelijk verbindingsprobleem opgetreden." };
    }
    return { ok: true, url: json.url };
  } catch (error) {
    console.error("[wallet] checkout connection failed");
    return { ok: false, reason: "Er is een tijdelijk verbindingsprobleem opgetreden." };
  }
}
