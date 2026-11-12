/**
 * Steunpagina (rout.be/<handle>/tip). ROUT verwerkt geen geld:
 *  • standaard: EPC/SEPA-QR + tekst-IBAN naar de rekening van de maker;
 *  • optioneel (BYOK): betaling op het eigen Stripe/Mollie-account van de maker.
 * Elke functie controleert zelf of de maker een geverifieerde root-handle heeft.
 */
import { sql } from "@/lib/neon";
import { isValidIban } from "@/lib/epc-qr";
import {
  TIP_MAX_IMAGES,
  checkStripeKey,
  normalizeExternalLinks,
  normalizeSocialSource,
  normalizeTipMethods,
  type ExternalTipLink,
  type TipMethod,
  type TipSocialSource,
} from "@/lib/tip-rules";

type Row = Record<string, unknown>;
export type PspProvider = "stripe" | "mollie";
export type PspMethod = "card" | "bancontact" | "wero";

export type TipEligibility = { ok: boolean; reason: "not_verified" | "no_root_handle" | null; handle: string | null; legalName: string | null; businessName: string | null; isBusiness: boolean };

export async function tipEligibility(userId: string): Promise<TipEligibility> {
  const rows = (await sql`
    select username, verified, status, verified_legal_name,
           coalesce(is_banned, false) as is_banned, coalesce(is_suspended, false) as is_suspended,
           coalesce((to_jsonb(profiles) ->> 'is_business')::boolean, false) as is_business,
           to_jsonb(profiles) ->> 'business_name' as business_name
      from public.profiles where id = ${userId} limit 1
  `) as Row[];
  const p = rows[0];
  const base = {
    handle: (p?.["username"] as string | null) ?? null,
    legalName: (p?.["verified_legal_name"] as string | null) ?? null,
    businessName: (p?.["business_name"] as string | null) ?? null,
    isBusiness: p?.["is_business"] === true,
  };
  if (!p || p["verified"] !== true || p["is_banned"] === true || p["is_suspended"] === true || (p["status"] && p["status"] !== "active"))
    return { ok: false, reason: "not_verified", ...base };
  if (!base.handle) return { ok: false, reason: "no_root_handle", ...base };
  return { ok: true, reason: null, ...base };
}

export async function assertTipEligible(userId: string) {
  const e = await tipEligibility(userId);
  if (!e.ok) throw new Error("Steunpagina vereist een geverifieerde identiteit.");
  return e;
}

export type TipSettings = {
  enabled: boolean;
  iban: string;
  accountName: string;
  presetsCents: number[];
  allowCustom: boolean;
  minCents: number;
  message: string;
  imageUrls: string[];
  methods: TipMethod[];
  externalLinks: ExternalTipLink[];
  socialSource: TipSocialSource;
};

const DEFAULTS: TipSettings = { enabled: false, iban: "", accountName: "", presetsCents: [500, 1000, 2500], allowCustom: true, minCents: 100, message: "", imageUrls: [], methods: normalizeTipMethods(null), externalLinks: [], socialSource: null };

function toSettings(r: Row | undefined): TipSettings {
  if (!r) return { ...DEFAULTS };
  return {
    enabled: r["enabled"] === true,
    iban: (r["iban"] as string | null) ?? "",
    accountName: (r["account_name"] as string | null) ?? "",
    presetsCents: Array.isArray(r["presets_cents"]) ? (r["presets_cents"] as number[]).map(Number) : DEFAULTS.presetsCents,
    allowCustom: r["allow_custom"] !== false,
    minCents: Number(r["min_cents"] ?? 100),
    message: (r["message"] as string | null) ?? "",
    imageUrls: Array.isArray(r["image_urls"]) ? (r["image_urls"] as string[]) : [],
    methods: normalizeTipMethods(r["methods"]),
    externalLinks: normalizeExternalLinks(r["external_links"]),
    socialSource: normalizeSocialSource(r["social_source"]),
  };
}

export async function readTipSettings(userId: string): Promise<TipSettings> {
  try {
    const rows = (await sql`select * from public.tip_settings where user_id = ${userId} limit 1`) as Row[];
    return toSettings(rows[0]);
  } catch {
    return { ...DEFAULTS };
  }
}

const norm = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();

export async function writeTipSettings(userId: string, input: TipSettings) {
  const e = await assertTipEligible(userId);
  const iban = input.iban.replace(/\s+/g, "").toUpperCase();
  if (input.enabled || iban) {
    if (!isValidIban(iban)) return { ok: false as const, message: "Dit IBAN is ongeldig." };
    const allowed = [e.legalName, e.isBusiness ? e.businessName : null].filter(Boolean).map((n) => norm(n!));
    if (allowed.length === 0) return { ok: false as const, message: "Er is nog geen goedgekeurde wettelijke naam voor je account." };
    if (!allowed.includes(norm(input.accountName)))
      return { ok: false as const, message: "De rekeninghouder moet overeenkomen met je geverifieerde naam." };
  }
  const presets = [...new Set(input.presetsCents.map((c) => Math.round(c)).filter((c) => c >= input.minCents && c <= 500_000))].sort((a, b) => a - b).slice(0, 6);
  const images = input.imageUrls.filter((u) => /^https:\/\//.test(u)).slice(0, TIP_MAX_IMAGES);
  const methods = JSON.stringify(normalizeTipMethods(input.methods));
  const links = JSON.stringify(normalizeExternalLinks(input.externalLinks));
  const social = normalizeSocialSource(input.socialSource);
  const socialJson = social ? JSON.stringify(social) : null;
  await sql`
    insert into public.tip_settings (user_id, enabled, iban, account_name, presets_cents, allow_custom, min_cents, message, image_urls, methods, external_links, social_source, updated_at)
    values (${userId}, ${input.enabled}, ${iban || null}, ${input.accountName.trim() || null}, ${presets}, ${input.allowCustom},
            ${input.minCents}, ${input.message.trim() || null}, ${images}, ${methods}::jsonb, ${links}::jsonb, ${socialJson}::jsonb, now())
    on conflict (user_id) do update set
      enabled = excluded.enabled, iban = excluded.iban, account_name = excluded.account_name,
      presets_cents = excluded.presets_cents, allow_custom = excluded.allow_custom, min_cents = excluded.min_cents,
      message = excluded.message, image_urls = excluded.image_urls, methods = excluded.methods,
      external_links = excluded.external_links, social_source = excluded.social_source, updated_at = now()
  `;
  return { ok: true as const };
}

/* ---------------------------------- PSP ---------------------------------- */

export type PspStatus = { provider: PspProvider; last4: string; mode: string; verifiedAt: string };

export async function listPsp(userId: string): Promise<PspStatus[]> {
  try {
    const rows = (await sql`select provider, last4, mode, verified_at from public.psp_credentials where user_id = ${userId}`) as Row[];
    return rows.map((r) => ({ provider: r["provider"] as PspProvider, last4: String(r["last4"]), mode: String(r["mode"]), verifiedAt: String(r["verified_at"]) }));
  } catch {
    return [];
  }
}

const KEY_SHAPE: Record<PspProvider, RegExp> = {
  stripe: /^rk_(live|test)_[A-Za-z0-9]{16,}$/,
  mollie: /^(live|test)_[A-Za-z0-9]{20,}$/,
};

async function probeKey(provider: PspProvider, secret: string): Promise<boolean> {
  try {
    if (provider === "stripe") {
      // Beperkte sleutel: 401 = ongeldig; 403 = geldig maar zonder leesrecht (verwacht).
      const res = await fetch("https://api.stripe.com/v1/payment_intents?limit=1", { headers: { Authorization: `Bearer ${secret}` } });
      return res.ok || res.status === 403;
    }
    const res = await fetch("https://api.mollie.com/v2/methods", { headers: { Authorization: `Bearer ${secret}` } });
    return res.ok;
  } catch {
    return false;
  }
}

export async function savePsp(userId: string, provider: PspProvider, rawSecret: string, publishableKey?: string | null) {
  const e = await assertTipEligible(userId);
  if (!e.isBusiness) return { ok: false as const, message: "Betaalproviders vereisen een goedgekeurde Bedrijfsbadge." };
  const { encryptionConfigured, seal } = await import("./crypto/secretbox.server");
  if (!encryptionConfigured()) return { ok: false as const, message: "Versleuteling is niet ingesteld op de server." };
  const secret = rawSecret.trim();
  let pk: string | null = null;
  if (provider === "stripe") {
    const check = checkStripeKey(secret);
    if (!check.ok) return { ok: false as const, message: check.message };
    pk = (publishableKey ?? "").trim();
    if (!/^pk_(live|test)_[A-Za-z0-9]{16,}$/.test(pk)) return { ok: false as const, message: "Vul ook je publishable key (pk_live_…) in." };
    if (pk.slice(3, 7) !== secret.slice(3, 7)) return { ok: false as const, message: "Live- en testsleutels mogen niet gemengd worden." };
  }
  if (!KEY_SHAPE[provider].test(secret)) return { ok: false as const, message: "Dit lijkt geen geldige geheime sleutel." };
  if (!(await probeKey(provider, secret))) return { ok: false as const, message: "De provider weigerde deze sleutel." };
  const mode = /(^|_)test_/.test(secret) ? "test" : "live";
  const { ciphertext, iv } = await seal(secret, `${userId}:${provider}`);
  await sql`
    insert into public.psp_credentials (user_id, provider, ciphertext, iv, last4, mode, publishable_key, verified_at)
    values (${userId}, ${provider}, ${ciphertext}, ${iv}, ${secret.slice(-4)}, ${mode}, ${pk}, now())
    on conflict (user_id, provider) do update set
      ciphertext = excluded.ciphertext, iv = excluded.iv, last4 = excluded.last4, mode = excluded.mode,
      publishable_key = excluded.publishable_key, verified_at = now()
  `;
  return { ok: true as const };
}

export async function deletePsp(userId: string, provider: PspProvider) {
  await sql`delete from public.psp_credentials where user_id = ${userId} and provider = ${provider}`;
  return { ok: true as const };
}

/* ------------------------------ Publieke pagina ----------------------------- */

export type PublicTipPage = {
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  accountName: string;
  iban: string;
  presetsCents: number[];
  allowCustom: boolean;
  minCents: number;
  message: string | null;
  imageUrls: string[];
  psp: { provider: PspProvider; methods: PspMethod[] } | null;
  methods: TipMethod[];
  externalLinks: ExternalTipLink[];
  socialSource: TipSocialSource;
};

async function ownerOf(rawHandle: string): Promise<{ id: string; handle: string; displayName: string | null; avatarUrl: string | null } | null> {
  const handle = rawHandle.replace(/^@+/, "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,63}$/.test(handle)) return null;
  const rows = (await sql`
    select id, username, display_name, avatar_url from public.profiles
     where username = ${handle} and coalesce(verified, false) = true and coalesce(is_banned, false) = false limit 1
  `) as Row[];
  const r = rows[0];
  return r ? { id: String(r["id"]), handle, displayName: (r["display_name"] as string | null) ?? null, avatarUrl: (r["avatar_url"] as string | null) ?? null } : null;
}

export async function readPublicTipPage(rawHandle: string): Promise<PublicTipPage | null> {
  try {
    const owner = await ownerOf(rawHandle);
    const elig = owner ? await tipEligibility(owner.id) : null;
    if (!owner || !elig?.ok) return null;
    const s = await readTipSettings(owner.id);
    if (!s.enabled || !isValidIban(s.iban) || !s.accountName) return null;
    // PSP-knoppen alleen voor goedgekeurde bedrijven; QR + IBAN blijven altijd.
    const psp = elig.isBusiness ? await listPsp(owner.id) : [];
    const mollie = psp.find((p) => p.provider === "mollie");
    const stripe = psp.find((p) => p.provider === "stripe");
    return {
      handle: owner.handle,
      displayName: owner.displayName,
      avatarUrl: owner.avatarUrl,
      accountName: s.accountName,
      iban: s.iban,
      presetsCents: s.presetsCents,
      allowCustom: s.allowCustom,
      minCents: s.minCents,
      message: s.message || null,
      imageUrls: s.imageUrls,
      psp: !s.methods.find((m) => m.id === "psp")?.enabled
        ? null
        : mollie
          ? { provider: "mollie", methods: ["card", "bancontact", "wero"] }
          : stripe
            ? { provider: "stripe", methods: ["card"] }
            : null,
      methods: s.methods,
      externalLinks: s.methods.find((m) => m.id === "links")?.enabled ? s.externalLinks : [],
      socialSource: s.socialSource,
    };
  } catch (error) {
    console.warn("[tip-page] read failed", error);
    return null;
  }
}

/** Maakt een betaling aan op het EIGEN PSP-account van de maker. ROUT raakt het geld niet aan. */
export async function startPspTip(opts: { handle: string; amountCents: number; method: PspMethod; origin: string }) {
  const page = await readPublicTipPage(opts.handle);
  if (!page?.psp || !page.psp.methods.includes(opts.method)) return { ok: false as const, message: "Deze betaalmethode is niet beschikbaar." };
  // The charged amount follows the creator's own saved rules (presets only
  // unless they allow custom amounts, never below their minimum); the
  // visitor's request only proposes an amount.
  const { resolveTipAmount } = await import("./payment-amount-policy");
  const amount = resolveTipAmount(opts.amountCents, {
    presetsCents: page.presetsCents,
    allowCustom: page.allowCustom,
    minCents: page.minCents,
  });
  if (amount === null) return { ok: false as const, message: "Ongeldig bedrag." };
  const owner = await ownerOf(page.handle);
  if (!owner) return { ok: false as const, message: "Onbekende maker." };
  const rows = (await sql`select ciphertext, iv from public.psp_credentials where user_id = ${owner.id} and provider = ${page.psp.provider} limit 1`) as Row[];
  if (!rows[0]) return { ok: false as const, message: "Geen betaalprovider gekoppeld." };
  const { open } = await import("./crypto/secretbox.server");
  const secret = await open(String(rows[0]["ciphertext"]), String(rows[0]["iv"]), `${owner.id}:${page.psp.provider}`);
  const back = `${opts.origin.replace(/\/$/, "")}/${encodeURIComponent(page.handle)}/tip`;
  const description = `Steun voor @${page.handle}`;

  try {
    if (page.psp.provider === "stripe") {
      // Ingebouwd: PaymentIntent op het account van de maker; de browser toont Stripe's eigen betaalvenster.
      const pkRows = (await sql`select publishable_key from public.psp_credentials where user_id = ${owner.id} and provider = 'stripe' limit 1`) as Row[];
      const publishableKey = (pkRows[0]?.["publishable_key"] as string | null) ?? null;
      if (!publishableKey) return { ok: false as const, message: "Deze maker moet zijn Stripe-koppeling vernieuwen." };
      const body = new URLSearchParams({
        amount: String(amount),
        currency: "eur",
        description,
        "automatic_payment_methods[enabled]": "true",
      });
      const res = await fetch("https://api.stripe.com/v1/payment_intents", {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const json = (await res.json()) as { client_secret?: string; error?: { message?: string } };
      if (!res.ok || !json.client_secret) {
        console.warn("[tip-page] stripe", res.status);
        return { ok: false as const, message: "De betaalprovider van de maker weigerde de betaling." };
      }
      return { ok: true as const, embedded: { clientSecret: json.client_secret, publishableKey, returnUrl: `${back}?status=success` } };
    }
    const payload: Record<string, unknown> = {
      amount: { currency: "EUR", value: (amount / 100).toFixed(2) },
      description,
      redirectUrl: `${back}?status=success`,
    };
    // Wero: Mollie toont het in de eigen checkout wanneer het op het account actief is.
    if (opts.method === "card") payload["method"] = "creditcard";
    if (opts.method === "bancontact") payload["method"] = "bancontact";
    const res = await fetch("https://api.mollie.com/v2/payments", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as { _links?: { checkout?: { href?: string } }; detail?: string };
    const url = json._links?.checkout?.href;
    if (!res.ok || !url) {
      console.warn("[tip-page] mollie", json.detail);
      return { ok: false as const, message: "De betaalprovider van de maker weigerde de betaling." };
    }
    return { ok: true as const, url };
  } catch (error) {
    console.warn("[tip-page] psp failed", error);
    return { ok: false as const, message: "Betaalprovider niet bereikbaar." };
  }
}
