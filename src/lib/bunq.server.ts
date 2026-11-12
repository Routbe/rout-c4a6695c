/**
 * bunq API-context: installation → device-server → session → bunq.me-tab.
 *
 * Server-only. Verwacht deze omgevingsvariabelen (Vercel/hosting):
 *   BUNQ_API_KEY      — API-key uit de bunq-app (productie of sandbox)
 *   BUNQ_PRIVATE_KEY  — PEM-encoded RSA-2048 private key van de installatie
 *   BUNQ_PUBLIC_KEY   — bijbehorende public key (PEM), bij installation gestuurd
 *   BUNQ_ENV          — "production" (default) of "sandbox"
 *
 * Requests worden ondertekend volgens de bunq-signing-regels: RSA-SHA256 over
 * de sequentie van Cache-Control, User-Agent en X-Bunq-* headers + body.
 */
import { createSign, randomBytes } from "crypto";

function baseUrl(): string {
  return process.env["BUNQ_ENV"] === "sandbox"
    ? "https://public-api.sandbox.bunq.com"
    : "https://api.bunq.com";
}

export function bunqConfigured(): boolean {
  return Boolean(
    process.env["BUNQ_API_KEY"] &&
    process.env["BUNQ_PRIVATE_KEY"] &&
    process.env["BUNQ_PUBLIC_KEY"],
  );
}

/** Sessietoken-cached: een bunq-session is ~1 dag geldig. */
let cachedSession: { token: string; userId: number; expiresAt: number } | null = null;
let cachedInstallationToken: string | null = null;

/**
 * Secret-opslag bewaart PEM-sleutels vaak op één regel (newlines → spaties).
 * Herstel het canonieke PEM-formaat zodat OpenSSL de sleutel accepteert.
 */
export function normalizePem(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes("\n") && !trimmed.includes("\\n")) return trimmed;
  const unescaped = trimmed.replace(/\\n/g, "\n");
  const match = unescaped.match(/-----BEGIN ([^-]+)-----([\s\S]*?)-----END \1-----/);
  if (!match) return unescaped;
  const label = match[1]!.trim();
  const body = match[2]!.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

function privateKeyPem(): string {
  return normalizePem(process.env["BUNQ_PRIVATE_KEY"]!);
}

function publicKeyPem(): string {
  return normalizePem(process.env["BUNQ_PUBLIC_KEY"]!);
}

/**
 * bunq v1 signing: de handtekening gaat uitsluitend over de ruwe request-body
 * (RSA-SHA256, base64). De oude header-sequentie-signing is door bunq
 * uitgefaseerd en levert "Invalid signature" op.
 */
function signBody(body: string): string {
  const sign = createSign("RSA-SHA256");
  sign.update(body, "utf8");
  return sign.sign(privateKeyPem(), "base64");
}

export interface BunqStepLog {
  step: string;
  method: string;
  path: string;
  status: number;
  ok: boolean;
  response: unknown;
}

/** Alle stappen van de laatste activatie-run, voor diagnose in de logs. */
let lastRunLog: BunqStepLog[] = [];

/** Maximaal aantal pogingen bij tijdelijke bunq-fouten (429 / 5xx / netwerk). */
const MAX_ATTEMPTS = 3;

/** Tijdelijke fout: bunq is even bezig of onbereikbaar → opnieuw proberen. */
function isTransientStatus(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Authenticated + signed call naar de bunq API, met volledige logging,
 * idempotency-id en exponential-backoff retry.
 *
 * `clientRequestId` maakt de call idempotent: bunq de-dupliceert requests met
 * dezelfde `X-Bunq-Client-Request-Id`, zodat een netwerkfout tijdens een
 * checkout nooit twee bunq.me-tabs oplevert.
 */
async function bunqCall<T>(
  method: "GET" | "POST",
  path: string,
  body: unknown,
  token: string | null,
  step = path,
  clientRequestId?: string,
): Promise<T> {
  const payload = body == null ? "" : JSON.stringify(body);
  // Eén vast id per logische call: retries hergebruiken het id (idempotent).
  const requestId = clientRequestId ?? randomBytes(16).toString("hex");

  const headers: Record<string, string> = {
    "Cache-Control": "no-cache",
    "User-Agent": "rout-central/1.0",
    "X-Bunq-Language": "en_US",
    "X-Bunq-Region": "en_US",
    "X-Bunq-Client-Request-Id": requestId,
    "X-Bunq-Geolocation": "0 0 0 0 000",
  };
  if (method !== "GET") {
    headers["Content-Type"] = "application/json";
    headers["X-Bunq-Client-Signature"] = signBody(payload);
  }
  if (token) headers["X-Bunq-Client-Authentication"] = token;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${baseUrl()}${path}`, {
        method,
        headers,
        body: method === "GET" ? undefined : payload,
      });
    } catch (networkError) {
      // Timeout of DNS/socket-fout: exponential backoff, zelfde request-id.
      lastError = networkError instanceof Error ? networkError : new Error(String(networkError));
      lastRunLog.push({ step, method, path, status: 0, ok: false, response: lastError.message });
      console.warn(
        `[bunq] ${step} netwerkfout (poging ${attempt}/${MAX_ATTEMPTS}):`,
        lastError.message,
      );
      if (attempt < MAX_ATTEMPTS) {
        await wait(400 * 2 ** (attempt - 1));
        continue;
      }
      throw new Error(`bunq ${step} (${method} ${path}) → netwerkfout: ${lastError.message}`);
    }

    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      /* niet-JSON antwoord: ruwe tekst loggen */
    }

    // Nooit ruwe provider-payloads loggen of bewaren: credentials,
    // e-mailadressen, IBAN's en rekeninghouders worden eerst geredacteerd
    // (security/redact.ts) — ook in de diagnose-run en foutmeldingen.
    const { redactLogPayload, redactText } = await import("./security/redact");
    const safeResponse = redactLogPayload(parsed);
    const entry: BunqStepLog = {
      step,
      method,
      path,
      status: res.status,
      ok: res.ok,
      response: safeResponse,
    };
    lastRunLog.push(entry);
    console.log(`[bunq] ${step} → ${method} ${path} HTTP ${res.status}`);

    if (!res.ok) {
      const error = new Error(
        `bunq ${step} (${method} ${path}) → HTTP ${res.status}: ${redactText(
          typeof safeResponse === "string" ? safeResponse : JSON.stringify(safeResponse),
        ).slice(0, 800)}`,
      );
      if (isTransientStatus(res.status) && attempt < MAX_ATTEMPTS) {
        const backoff = 400 * 2 ** (attempt - 1);
        console.warn(`[bunq] ${step} HTTP ${res.status} — retry ${attempt + 1} over ${backoff}ms`);
        await wait(backoff);
        lastError = error;
        continue;
      }
      throw error;
    }
    // bunq verpakt alles in { "Response": [ ... ] }; geef die array direct terug.
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { Response?: unknown }).Response)
    ) {
      return (parsed as { Response: unknown }).Response as T;
    }
    return (parsed as T) ?? ({} as T);
  }

  throw lastError ?? new Error(`bunq ${step} (${method} ${path}) mislukt`);
}

interface BunqAccountRaw {
  id: number;
  currency: string;
  status: string;
  description?: string;
  alias?: { type: string; value: string; name?: string }[];
  /** Aanvullende velden die bunq per rekeningtype meestuurt (BIC, routing, …). */
  [extra: string]: unknown;
}

interface BunqResponseItem {
  Token?: { id: number; token: string };
  Id?: { id: number };
  UserPerson?: { id: number };
  UserCompany?: { id: number };
  MonetaryAccountBank?: BunqAccountRaw;
  BunqMeTab?: {
    id: number;
    bunqme_tab_share_url?: string;
    bunqme_tab_entry?: { bunqme_tab_share_url?: string; share_url?: string };
    status: string;
    /** Afgeronde betalingen op deze tab (bron van waarheid bij snelle betalingen). */
    result_inquiries?: {
      payment?: { Payment?: { amount?: { value?: string; currency?: string } } };
    }[];
  };

  ServerPublicKey?: { server_public_key: string };
}

/** Stap 0 — installation: registreer onze public key, ontvang installatie-token. */
async function ensureInstallation(): Promise<string> {
  if (cachedInstallationToken) return cachedInstallationToken;
  const res = await bunqCall<BunqResponseItem[]>(
    "POST",
    "/v1/installation",
    { client_public_key: publicKeyPem() },
    null,
    "STAP 0: installation",
  );
  const token = res.find((i) => i.Token)?.Token?.token;
  if (!token) throw new Error("bunq installation zonder token");
  cachedInstallationToken = token;
  return token;
}

/**
 * Kies het bunq-secret: het persoonlijke OAuth-token van een gekoppeld lid,
 * anders de globale `BUNQ_API_KEY`. Zo werken de oude sleutels en de nieuwe
 * OAuth-koppeling naast elkaar.
 */
async function resolveSecret(userId?: string | null): Promise<string> {
  if (userId) {
    try {
      const { bunqApiKeyForUser } = await import("./bunq-oauth.server");
      const key = await bunqApiKeyForUser(userId);
      if (key) return key;
    } catch (err) {
      console.warn("[bunq] OAuth-token ophalen mislukt, val terug op BUNQ_API_KEY:", err);
    }
  }
  return process.env["BUNQ_API_KEY"] ?? "";
}

/** Stap 1 — device-server: bind de API-key definitief aan deze server. */
async function registerDevice(installationToken: string, secret: string): Promise<void> {
  await bunqCall(
    "POST",
    "/v1/device-server",
    {
      description: "ROUT Server",
      secret,
      permitted_ips: ["*"],
    },
    installationToken,
    "STAP 1: device-server",
  );
}

/** Stap 2 — session-server: ruil de API-key om voor een sessietoken + user-id. */
async function ensureSession(bunqUserRef?: string | null): Promise<{
  token: string;
  userId: number;
}> {
  const secret = await resolveSecret(bunqUserRef);
  const global = secret === (process.env["BUNQ_API_KEY"] ?? "");
  if (global && cachedSession && cachedSession.expiresAt > Date.now() + 60_000) {
    return { token: cachedSession.token, userId: cachedSession.userId };
  }
  const installation = await ensureInstallation();
  try {
    await registerDevice(installation, secret);
  } catch (err) {
    // Device kan al geregistreerd zijn; loggen en doorgaan naar de session.
    console.warn("[bunq] STAP 1 device-server niet gelukt (mogelijk al gebonden):", err);
  }
  const res = await bunqCall<BunqResponseItem[]>(
    "POST",
    "/v1/session-server",
    { secret },
    installation,
    "STAP 2: session-server",
  );
  const token = res.find((i) => i.Token)?.Token?.token;
  const userId =
    res.find((i) => i.UserPerson)?.UserPerson?.id ??
    res.find((i) => i.UserCompany)?.UserCompany?.id;
  if (!token || !userId) throw new Error("bunq session zonder token of user");
  if (global) cachedSession = { token, userId, expiresAt: Date.now() + 23 * 60 * 60 * 1000 };
  return { token, userId };
}

/**
 * Diagnostische activatie-run: installation → device-server → session-server →
 * bunq.me-tab, met de ruwe HTTP-status en JSON-respons van elke stap.
 */
export async function runBunqActivation(amountCents = 399): Promise<{
  ok: boolean;
  shareUrl?: string;
  error?: string;
  steps: BunqStepLog[];
}> {
  lastRunLog = [];
  cachedSession = null;
  cachedInstallationToken = null;

  if (!bunqConfigured()) {
    return {
      ok: false,
      error: "BUNQ_API_KEY / BUNQ_PRIVATE_KEY / BUNQ_PUBLIC_KEY ontbreken in de omgeving",
      steps: [],
    };
  }

  try {
    const tab = await createBunqMeTab({
      amountCents,
      description: `ROUT live test ${new Date().toISOString().slice(0, 16)}`,
    });
    console.log(`[bunq] STAP 4 gelukt → ${tab.shareUrl}`);
    return { ok: true, shareUrl: tab.shareUrl, steps: lastRunLog };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[bunq] activatie mislukt:", message);
    return { ok: false, error: message, steps: lastRunLog };
  }
}

export interface BunqAccount {
  id: number;
  currency: string;
  status: string;
  description: string;
  iban: string | null;
  /** Landcode uit de IBAN (bijv. `DE`, `ES`, `IE`, `NL`). */
  ibanCountry: string | null;
  /** BIC/SWIFT van deze subrekening, indien bunq die meestuurt. */
  bic: string | null;
  /** Rekeninghouder zoals die bij bunq geregistreerd staat. */
  holder: string | null;
  /** US ACH routing number (alleen USD-rekeningen). */
  routingNumber: string | null;
  /** UK sort code (alleen GBP-rekeningen). */
  sortCode: string | null;
  /** Lokaal rekeningnummer (alleen niet-IBAN-rekeningen zoals USD/GBP). */
  accountNumber: string | null;
}

/** Pluk een aliaswaarde uit de bunq-respons op basis van het type. */
function aliasValue(raw: BunqAccountRaw, match: RegExp): string | null {
  const hit = raw.alias?.find((a) => match.test(String(a.type ?? "").toUpperCase()));
  return hit?.value ? String(hit.value).replace(/\s+/g, "") : null;
}

/** Sommige bunq-rekeningtypes zetten BIC/routing als los veld i.p.v. alias. */
function rawField(raw: BunqAccountRaw, keys: string[]): string | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value.replace(/\s+/g, "");
  }
  return null;
}

/** STAP 3 — alle monetary-accounts (subrekeningen) van de bunq-gebruiker. */
export async function listMonetaryAccounts(): Promise<BunqAccount[]> {
  const { token, userId } = await ensureSession();
  return fetchAccounts(token, userId);
}

async function fetchAccounts(token: string, userId: number): Promise<BunqAccount[]> {
  const res = await bunqCall<Record<string, BunqAccountRaw>[]>(
    "GET",
    `/v1/user/${userId}/monetary-account?count=50`,
    null,
    token,
    "STAP 3: monetary-account",
  );
  const accounts: BunqAccount[] = [];
  for (const item of res) {
    for (const [key, raw] of Object.entries(item ?? {})) {
      // bunq levert MonetaryAccountBank, -Savings, -Joint, … — alle varianten tellen.
      if (!key.startsWith("MonetaryAccount") || !raw || typeof raw !== "object") continue;
      const ibanAlias = raw.alias?.find((a) => String(a.type).toUpperCase() === "IBAN");
      const iban = ibanAlias?.value?.replace(/\s+/g, "") ?? null;
      accounts.push({
        id: raw.id,
        currency: String(raw.currency ?? "EUR").toUpperCase(),
        status: String(raw.status ?? ""),
        description: String(raw.description ?? ""),
        iban,
        ibanCountry: iban ? iban.slice(0, 2).toUpperCase() : null,
        bic: aliasValue(raw, /^(BIC|SWIFT)/) ?? rawField(raw, ["bic", "swift", "swift_bic"]),
        holder:
          ibanAlias?.name?.trim() ||
          raw.alias?.find((a) => a.name)?.name?.trim() ||
          rawField(raw, ["display_name"]) ||
          null,
        routingNumber:
          aliasValue(raw, /ROUTING|ABA/) ?? rawField(raw, ["routing_number", "aba_routing_number"]),
        sortCode: aliasValue(raw, /SORT_?CODE/) ?? rawField(raw, ["sort_code"]),
        accountNumber:
          aliasValue(raw, /ACCOUNT_NUMBER|LOCAL/) ??
          rawField(raw, ["account_number", "local_account_number"]),
      });
    }
  }
  return accounts;
}

export interface AccountRoute {
  account: BunqAccount;
  /** Valuta waarin het bunq.me-verzoek wordt opgevraagd. */
  currency: string;
  /** `true` wanneer er géén subrekening in deze valuta bestaat. */
  foreignCurrencyFallback: boolean;
}

/** Actieve rekeningen (of alles, als bunq geen status meestuurt). */
function activePool(accounts: BunqAccount[]): BunqAccount[] {
  const active = accounts.filter((a) => a.status === "ACTIVE");
  return active.length ? active : accounts;
}

/**
 * Zoek primair op VALUTA (`USD`, `GBP`, `HUF`, …); binnen die valuta krijgt de
 * rekening met een IBAN uit het gekozen land — of met dat land in de
 * omschrijving — voorrang.
 */
function matchByCurrency(
  accounts: BunqAccount[],
  currency: string,
  iso: string,
): BunqAccount | null {
  const same = accounts.filter((a) => a.currency === currency.toUpperCase());
  if (!same.length) return null;
  const byIban = iso ? same.find((a) => a.ibanCountry === iso) : undefined;
  const byName = iso ? same.find((a) => a.description.toUpperCase().includes(iso)) : undefined;
  return byIban ?? byName ?? same[0]!;
}

/** De centrale EUR-hoofdrekening (BE/NL) — het SEPA-vangnet. */
function mainEurAccount(accounts: BunqAccount[]): BunqAccount | null {
  const pool = activePool(accounts);
  const eur = pool.filter((a) => a.currency === "EUR" && a.iban);
  return (
    eur.find((a) => a.ibanCountry === "BE" || a.ibanCountry === "NL") ??
    eur[0] ??
    pool.find((a) => a.currency === "EUR") ??
    null
  );
}

export type TransferRoute =
  | { kind: "local"; account: BunqAccount; currency: string }
  | { kind: "sepa_main"; account: BunqAccount; currency: "EUR" }
  | { kind: "none"; currency: string };

/**
 * Bankgegevens-routing voor een overschrijving.
 *
 * 1. Exacte valuta-match op een actieve subrekening → lokale gegevens.
 * 2. SEPA-land zonder eigen land-IBAN → centrale EUR-hoofdrekening. Voor
 *    SEPA-landen komt er dus NOOIT een "geen bankgegevens"-uitkomst.
 * 3. Vreemde valuta zonder subrekening → `none`, zodat de checkout kan
 *    terugvallen op een dynamisch bunq.me-verzoek in die valuta.
 */
export function resolveTransferRoute(
  accounts: BunqAccount[],
  currency: string,
  country?: string | null,
  options?: { sepaCountry?: boolean },
): TransferRoute {
  const wanted = (currency || "EUR").toUpperCase();
  const iso = (country ?? "").toUpperCase();
  const pool = activePool(accounts);

  const local = matchByCurrency(pool, wanted, iso);
  if (local && (local.iban || local.accountNumber)) {
    return { kind: "local", account: local, currency: local.currency };
  }

  // Absolute SEPA-regel: EUR-hoofdrekening tonen, nooit een foutmelding.
  if (wanted === "EUR" || options?.sepaCountry) {
    const main = mainEurAccount(accounts);
    if (main) return { kind: "sepa_main", account: main, currency: "EUR" };
  }

  return { kind: "none", currency: wanted };
}

/**
 * Kies de subrekening voor een bunq.me-verzoek: exacte valuta-match, anders
 * het hoofd-EUR-account met de gevraagde valuta als indicator.
 */
export function selectAccount(
  accounts: BunqAccount[],
  currency: string,
  country?: string | null,
): AccountRoute {
  const wanted = (currency || "EUR").toUpperCase();
  const iso = (country ?? "").toUpperCase();
  const pool = activePool(accounts);

  const match = matchByCurrency(pool, wanted, iso);
  if (match) return { account: match, currency: wanted, foreignCurrencyFallback: false };

  const main = mainEurAccount(accounts) ?? pool[0];
  if (!main) throw new Error("Geen actief bunq monetary-account gevonden");
  return { account: main, currency: wanted, foreignCurrencyFallback: true };
}

/**
 * Zoekt of maakt een monetary-account in de gevraagde valuta.
 *
 * Cruciaal: eerst LEZEN. Bestaat er al een (actieve) subrekening in die
 * valuta — bijv. GBP of USD — dan gebruiken we die. Alleen als er echt geen
 * rekening in die valuta is, proberen we er één aan te maken. Mislukt dat
 * (geen rechten, valuta niet ondersteund, limiet bereikt), dan vallen we
 * netjes terug op de EUR-hoofdrekening in plaats van te crashen.
 */
async function ensureAccountForCurrency(
  token: string,
  userId: number,
  accounts: BunqAccount[],
  currency: string,
  country?: string | null,
): Promise<AccountRoute> {
  const wanted = (currency || "EUR").toUpperCase();
  const iso = (country ?? "").toUpperCase();

  // 1. Bestaande rekening in deze valuta hergebruiken.
  const existing = matchByCurrency(activePool(accounts), wanted, iso);
  if (existing) return { account: existing, currency: wanted, foreignCurrencyFallback: false };

  // 2. Niets gevonden: pas nu proberen aan te maken.
  if (wanted !== "EUR") {
    try {
      await bunqCall<BunqResponseItem[]>(
        "POST",
        `/v1/user/${userId}/monetary-account-bank`,
        {
          currency: wanted,
          description: `ROUT ${wanted}`,
          daily_limit: { value: "1000.00", currency: wanted },
        },
        token,
        `STAP 3b: monetary-account-bank (${wanted})`,
      );
      // Opnieuw uitlezen: bunq geeft de aliassen (IBAN/sort code) pas daarna.
      const refreshed = await fetchAccounts(token, userId);
      const created = matchByCurrency(activePool(refreshed), wanted, iso);
      if (created) return { account: created, currency: wanted, foreignCurrencyFallback: false };
    } catch (err) {
      console.warn(
        `[bunq] kon geen ${wanted}-rekening aanmaken; terugval op EUR-hoofdrekening:`,
        err instanceof Error ? err.message.slice(0, 300) : err,
      );
    }
  }

  // 3. Vangnet: EUR-hoofdrekening.
  const main = mainEurAccount(accounts) ?? activePool(accounts)[0];
  if (!main) throw new Error("Geen actief bunq monetary-account gevonden");
  return { account: main, currency: wanted, foreignCurrencyFallback: true };
}

/**
 * Publieke variant van {@link ensureAccountForCurrency} voor de
 * overschrijvings-checkout: controleert of ROUT al een actieve subrekening in
 * de gevraagde valuta bezit en maakt er anders automatisch één aan via de
 * bunq-API. Zo krijgt élke valuta lokale bankgegevens in plaats van een
 * generieke terugval.
 */
export async function ensureMonetaryAccountForCurrency(
  currency: string,
  country?: string | null,
): Promise<{ account: BunqAccount; created: boolean; foreignCurrencyFallback: boolean }> {
  const { token, userId } = await ensureSession();
  const before = await fetchAccounts(token, userId);
  const beforeIds = new Set(before.map((a) => a.id));
  const route = await ensureAccountForCurrency(token, userId, before, currency, country ?? null);
  return {
    account: route.account,
    created: !beforeIds.has(route.account.id),
    foreignCurrencyFallback: route.foreignCurrencyFallback,
  };
}

export interface BunqMeTabResult {
  shareUrl: string;
  tabId: number;
  /** Valuta waarin het verzoek uiteindelijk is aangemaakt. */
  currency: string;
  /** Gebruikte subrekening. */
  account: BunqAccount;
  /** `true` als de valuta via het hoofd-EUR-account is verwerkt. */
  foreignCurrencyFallback: boolean;
}

/**
 * Stap 4 — maak een bunq.me-tab (betaalverzoek) met bedrag + omschrijving op de
 * juiste subrekening. De omschrijving draagt de ROUT-referentie zodat de
 * bankwebhook de betaling automatisch kan matchen.
 */
export async function createBunqMeTab(opts: {
  amountCents: number;
  description: string;
  redirectUrl?: string;
  /** ISO 4217-valuta; standaard EUR. */
  currency?: string;
  /** Landcode van de koper, voor de landspecifieke EUR-rekening. */
  country?: string | null;
  /**
   * Idempotency-sleutel per checkout-sessie. Dezelfde sleutel levert bij bunq
   * nooit een tweede tab op, ook niet na een netwerkfout of dubbele klik.
   */
  clientRequestId?: string;
  /** ROUT-lid met een eigen bunq-OAuth-koppeling; anders de globale API-key. */
  routUserId?: string | null;
}): Promise<BunqMeTabResult> {
  const { token, userId } = await ensureSession(opts.routUserId ?? null);

  const accounts = await fetchAccounts(token, userId);
  const route = await ensureAccountForCurrency(
    token,
    userId,
    accounts,
    opts.currency ?? "EUR",
    opts.country ?? null,
  );

  const value = (opts.amountCents / 100).toFixed(2);

  const { maskIban } = await import("./security/redact");
  console.log(
    `[bunq] routing → valuta ${route.currency}, land ${opts.country ?? "-"}, rekening ${route.account.id} (${route.account.currency}, ${route.account.iban ? maskIban(route.account.iban) : "geen IBAN"})` +
      (route.foreignCurrencyFallback ? " — vreemde-valuta-flow via hoofd-EUR-account" : ""),
  );

  const create = async (currency: string) =>
    bunqCall<BunqResponseItem[]>(
      "POST",
      `/v1/user/${userId}/monetary-account/${route.account.id}/bunqme-tab`,
      {
        bunqme_tab_entry: {
          amount_inquired: { value, currency },
          description: opts.description.slice(0, 140),
          ...(opts.redirectUrl ? { redirect_url: opts.redirectUrl } : {}),
        },
        status: "WAITING_FOR_PAYMENT",
      },
      token,
      `STAP 4: bunqme-tab (${currency})`,
      // Valuta in de sleutel: de EUR-fallback is een andere logische call.
      opts.clientRequestId ? `${opts.clientRequestId}-${currency}`.slice(0, 64) : undefined,
    );

  let usedCurrency = route.currency;
  let created: BunqResponseItem[];
  try {
    created = await create(usedCurrency);
  } catch (err) {
    if (!route.foreignCurrencyFallback || usedCurrency === route.account.currency) throw err;
    // bunq weigert deze vreemde valuta op het EUR-account: val terug op EUR.
    console.warn(
      `[bunq] ${usedCurrency} geweigerd op rekening ${route.account.id}; opnieuw in ${route.account.currency}`,
    );
    usedCurrency = route.account.currency;
    created = await create(usedCurrency);
  }

  const tabId = created.find((i) => i.Id)?.Id?.id;
  if (!tabId) throw new Error("bunq.me-tab zonder id");

  // De share_url staat niet in de create-response; haal de tab op.
  const detail = await bunqCall<BunqResponseItem[]>(
    "GET",
    `/v1/user/${userId}/monetary-account/${route.account.id}/bunqme-tab/${tabId}`,
    null,
    token,
    "STAP 4b: bunqme-tab detail",
  );
  const entry = detail.find((i) => i.BunqMeTab)?.BunqMeTab;
  const shareUrl =
    entry?.bunqme_tab_share_url ??
    entry?.bunqme_tab_entry?.bunqme_tab_share_url ??
    entry?.bunqme_tab_entry?.share_url;
  if (!shareUrl) {
    throw new Error("bunq.me-tab zonder share_url");
  }
  return {
    shareUrl,
    tabId,
    currency: usedCurrency,
    account: route.account,
    foreignCurrencyFallback: route.foreignCurrencyFallback,
  };
}

/**
 * Diagnostische matrix: maakt per land een bunq.me-verzoek en rapporteert welke
 * subrekening, valuta en URL eruit komen. Alleen voor handmatige tests.
 */
export async function runBunqCountryMatrix(
  countries: string[],
  amountCents = 399,
): Promise<
  {
    country: string;
    currency: string;
    accountId?: number;
    iban?: string | null;
    fallback?: boolean;
    shareUrl?: string;
    error?: string;
  }[]
> {
  const { currencyForCountry } = await import("./bunq-currency");
  const out: Awaited<ReturnType<typeof runBunqCountryMatrix>> = [];
  for (const country of countries) {
    const currency = currencyForCountry(country);
    try {
      const tab = await createBunqMeTab({
        amountCents,
        description: `ROUT test ${country} ${currency}`,
        currency,
        country,
      });
      out.push({
        country,
        currency: tab.currency,
        accountId: tab.account.id,
        iban: tab.account.iban,
        fallback: tab.foreignCurrencyFallback,
        shareUrl: tab.shareUrl,
      });
    } catch (err) {
      out.push({ country, currency, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return out;
}

/**
 * Status van één bunq.me-tab, gebruikt door de live betaalstatus-polling.
 *
 * bunq laat de tab-status soms nog even op `WAITING_FOR_PAYMENT` staan terwijl
 * er al een afgeronde betaling (`result_inquiries`) aan hangt — precies het
 * geval van een betaling binnen 30 seconden. Daarom kijken we naar beide:
 * zodra er een result inquiry is óf de status een betaalde variant is,
 * rapporteren we `paid`.
 */
export async function readBunqMeTabStatus(
  accountId: number,
  tabId: number,
): Promise<{ status: string; shareUrl: string | null; paid: boolean }> {
  const { token, userId } = await ensureSession();
  const detail = await bunqCall<BunqResponseItem[]>(
    "GET",
    `/v1/user/${userId}/monetary-account/${accountId}/bunqme-tab/${tabId}`,
    null,
    token,
    "POLL: bunqme-tab status",
  );
  const entry = detail.find((i) => i.BunqMeTab)?.BunqMeTab;
  const status = entry?.status ?? "UNKNOWN";
  const paidStatus = /^(PAID|ACCEPTED|SUCCEEDED|SETTLED)$/i.test(status);
  const hasResult = (entry?.result_inquiries?.length ?? 0) > 0;
  return {
    status: paidStatus || hasResult ? "PAID" : status,
    paid: paidStatus || hasResult,
    shareUrl:
      entry?.bunqme_tab_share_url ??
      entry?.bunqme_tab_entry?.bunqme_tab_share_url ??
      entry?.bunqme_tab_entry?.share_url ??
      null,
  };
}

/** Compacte health-check voor de admin: leeft de bunq SessionServer-verbinding? */
export async function checkBunqApiStatus(): Promise<{
  ok: boolean;
  status: number;
  message: string;
  accounts?: number;
}> {
  try {
    const { token, userId } = await ensureSession();
    const accounts = await fetchAccounts(token, userId);
    return { ok: true, status: 200, message: "Actief (200 OK)", accounts: accounts.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const match = /HTTP (\d{3})/.exec(message);
    return { ok: false, status: match ? Number(match[1]) : 0, message };
  }
}
