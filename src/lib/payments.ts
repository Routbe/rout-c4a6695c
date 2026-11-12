/**
 * Payment & Checkout registry.
 *
 * Every payment network is described declaratively (fields + payload builder)
 * so the UI can render one generic form and the QR engine gets a single string.
 */

export type PaymentId =
  | "iban"
  | "wero"
  | "bancontact"
  | "payconiq"
  | "paypal"
  | "venmo"
  | "cashapp"
  | "pix"
  | "alipay"
  | "wechat"
  | "crypto";

export type PaymentRegion = "europe" | "north-america" | "latin-america" | "asia" | "global";

export interface PaymentField {
  key: string;
  label: string;
  placeholder?: string;
  type?: "text" | "number" | "select";
  options?: { value: string; label: string }[];
  optional?: boolean;
  uppercase?: boolean;
}

export interface PaymentMethod {
  id: PaymentId;
  label: string;
  region: PaymentRegion;
  /** One-line hint, hidden behind the (i) icon in the UI. */
  hint: string;
  fields: PaymentField[];
  build: (v: Record<string, string>) => string;
}

export const PAYMENT_REGIONS: { id: PaymentRegion; label: string }[] = [
  { id: "europe", label: "Europe" },
  { id: "north-america", label: "North America" },
  { id: "latin-america", label: "Latin America" },
  { id: "asia", label: "Asia" },
  { id: "global", label: "Crypto / Global" },
];

const clean = (s?: string) => (s ?? "").trim();
const num = (s?: string) => {
  const n = parseFloat((s ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const httpify = (s: string) => (/^https?:\/\//i.test(s) ? s : `https://${s}`);

/** EPC069-12 SEPA Credit Transfer payload (scan-to-pay in EU banking apps). */
export function buildSepaPayload(v: Record<string, string>): string {
  const acc = clean(v.iban).replace(/\s+/g, "").toUpperCase();
  const name = clean(v.name);
  if (!acc || !name) return "";
  const amount = num(v.amount);
  return [
    "BCD",
    "002",
    "1",
    "SCT",
    clean(v.bic).toUpperCase(),
    name.slice(0, 70),
    acc,
    amount > 0 ? `EUR${amount.toFixed(2)}` : "",
    "",
    "",
    clean(v.reference).slice(0, 140),
    "",
  ].join("\n");
}

/* ---------------------------------- Pix ---------------------------------- */

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const emv = (id: string, value: string) => `${id}${String(value.length).padStart(2, "0")}${value}`;

/** BR Code (Pix static QR, EMV®QRCPS). */
export function buildPixPayload(v: Record<string, string>): string {
  const key = clean(v.key);
  const name = clean(v.name);
  const city = clean(v.city) || "SAO PAULO";
  if (!key || !name) return "";
  const amount = num(v.amount);
  const txid = (clean(v.txid) || "***").replace(/[^A-Za-z0-9*]/g, "").slice(0, 25) || "***";

  const merchantAccount = emv("00", "br.gov.bcb.pix") + emv("01", key);
  let payload =
    emv("00", "01") +
    emv("26", merchantAccount) +
    emv("52", "0000") +
    emv("53", "986") +
    (amount > 0 ? emv("54", amount.toFixed(2)) : "") +
    emv("58", "BR") +
    emv("59", name.toUpperCase().slice(0, 25)) +
    emv("60", city.toUpperCase().slice(0, 15)) +
    emv("62", emv("05", txid));
  payload += "6304";
  return payload + crc16(payload);
}

/* -------------------------------- Registry -------------------------------- */

export const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: "iban",
    label: "SEPA / EPC credit transfer",
    region: "europe",
    hint: "Open EPC069-12 standard — free forever and supported by every European banking app. Beneficiary, amount and reference are pre-filled on scan.",
    fields: [
      { key: "name", label: "Beneficiary name", placeholder: "Jona Zeno Delplanche" },
      { key: "iban", label: "IBAN", placeholder: "BE71 0961 2345 6769", uppercase: true },
      {
        key: "amount",
        label: "Amount (EUR)",
        placeholder: "25.00",
        type: "number",
        optional: true,
      },
      {
        key: "reference",
        label: "Remittance / reference",
        placeholder: "Invoice 2026-014",
        optional: true,
      },
      {
        key: "bic",
        label: "BIC / SWIFT",
        placeholder: "GKCCBEBB",
        optional: true,
        uppercase: true,
      },
    ],
    build: buildSepaPayload,
  },
  {
    id: "wero",
    label: "Wero / Bancontact instant link",
    region: "europe",
    hint: "Payconiq has merged into Wero and Bancontact Pay. Paste the payment link from your merchant profile, or pay to a phone number or e-mail.",
    fields: [
      {
        key: "link",
        label: "Merchant payment URL / Wero deeplink",
        placeholder: "https://wero-wallet.eu/... or https://payconiq.com/t/1/...",
        optional: true,
      },
      { key: "label", label: "Display label", placeholder: "Table 4", optional: true },
      { key: "phone", label: "Phone number", placeholder: "+32 470 12 34 56", optional: true },
      { key: "email", label: "E-mail", placeholder: "jane@example.com", optional: true },
      { key: "name", label: "Your name", placeholder: "Jona Zeno Delplanche", optional: true },
      {
        key: "amount",
        label: "Amount (EUR)",
        placeholder: "25.00",
        type: "number",
        optional: true,
      },
    ],
    build: (v) => {
      const link = clean(v.link);
      if (link) return httpify(link);
      const alias = clean(v.phone) || clean(v.email);
      if (!alias) return "";
      const params = new URLSearchParams();
      params.set("to", alias);
      if (clean(v.name)) params.set("name", clean(v.name));
      const amount = num(v.amount);
      if (amount > 0) params.set("amount", amount.toFixed(2));
      if (clean(v.label)) params.set("message", clean(v.label));
      return `https://wero-wallet.eu/pay?${params.toString()}`;
    },
  },

  {
    id: "paypal",
    label: "PayPal",
    region: "north-america",
    hint: "Uses your PayPal.me handle. Adding an amount and currency opens checkout pre-filled.",
    fields: [
      { key: "handle", label: "PayPal.me handle", placeholder: "janedoe" },
      { key: "amount", label: "Amount", placeholder: "25.00", type: "number", optional: true },
      {
        key: "currency",
        label: "Currency",
        type: "select",
        optional: true,
        options: [
          { value: "EUR", label: "EUR" },
          { value: "USD", label: "USD" },
          { value: "GBP", label: "GBP" },
          { value: "CAD", label: "CAD" },
          { value: "AUD", label: "AUD" },
        ],
      },
    ],
    build: (v) => {
      const handle = clean(v.handle)
        .replace(/^@/, "")
        .replace(/^.*paypal\.me\//i, "");
      if (!handle) return "";
      const amount = num(v.amount);
      const cur = clean(v.currency) || "EUR";
      return `https://paypal.me/${handle}${amount > 0 ? `/${amount.toFixed(2)}${cur}` : ""}`;
    },
  },
  {
    id: "venmo",
    label: "Venmo",
    region: "north-america",
    hint: "Opens your Venmo profile with a pre-filled payment. US accounts only.",
    fields: [
      { key: "handle", label: "Venmo username", placeholder: "jane-doe" },
      {
        key: "amount",
        label: "Amount (USD)",
        placeholder: "25.00",
        type: "number",
        optional: true,
      },
      { key: "note", label: "Note", placeholder: "Thanks!", optional: true },
    ],
    build: (v) => {
      const handle = clean(v.handle).replace(/^@/, "");
      if (!handle) return "";
      const params: string[] = ["txn=pay"];
      const amount = num(v.amount);
      if (amount > 0) params.push(`amount=${amount.toFixed(2)}`);
      if (clean(v.note)) params.push(`note=${encodeURIComponent(clean(v.note))}`);
      return `https://venmo.com/u/${handle}?${params.join("&")}`;
    },
  },
  {
    id: "cashapp",
    label: "Cash App",
    region: "north-america",
    hint: "Your $Cashtag. With an amount the Cash App checkout opens pre-filled.",
    fields: [
      { key: "cashtag", label: "Cashtag", placeholder: "$janedoe" },
      {
        key: "amount",
        label: "Amount (USD)",
        placeholder: "25.00",
        type: "number",
        optional: true,
      },
    ],
    build: (v) => {
      const tag = clean(v.cashtag).replace(/^\$/, "");
      if (!tag) return "";
      const amount = num(v.amount);
      return `https://cash.app/$${tag}${amount > 0 ? `/${amount.toFixed(2)}` : ""}`;
    },
  },
  {
    id: "pix",
    label: "Pix (Brazil)",
    region: "latin-america",
    hint: "Static BR Code (EMV®QRCPS) with CRC16 checksum — accepted by every Brazilian banking app.",
    fields: [
      { key: "key", label: "Pix key", placeholder: "email, phone, CPF/CNPJ or random key" },
      { key: "name", label: "Receiver name", placeholder: "JONA ZENO DELPLANCHE" },
      { key: "city", label: "City", placeholder: "SAO PAULO", optional: true },
      {
        key: "amount",
        label: "Amount (BRL)",
        placeholder: "25.00",
        type: "number",
        optional: true,
      },
      { key: "txid", label: "Transaction ID", placeholder: "INVOICE2026", optional: true },
    ],
    build: buildPixPayload,
  },
  {
    id: "alipay",
    label: "Alipay+",
    region: "asia",
    hint: "Alipay payment codes are issued by Alipay itself — paste the receive-money link from the app.",
    fields: [{ key: "link", label: "Alipay link", placeholder: "https://qr.alipay.com/..." }],
    build: (v) => (clean(v.link) ? httpify(clean(v.link)) : ""),
  },
  {
    id: "wechat",
    label: "WeChat Pay",
    region: "asia",
    hint: "Paste the receive-money link from WeChat Pay (Me → Services → Money → Receive).",
    fields: [{ key: "link", label: "WeChat Pay link", placeholder: "https://wxp.tenpay.com/..." }],
    build: (v) => (clean(v.link) ? httpify(clean(v.link)) : ""),
  },
  {
    id: "crypto",
    label: "Crypto / Lightning",
    region: "global",
    hint: "BIP21 for Bitcoin, EIP-681 for EVM/USDT, and lightning: URIs for invoices or LNURL.",
    fields: [
      {
        key: "network",
        label: "Network",
        type: "select",
        options: [
          { value: "bitcoin", label: "Bitcoin (on-chain)" },
          { value: "lightning", label: "Bitcoin Lightning" },
          { value: "evm", label: "USDT / EVM address" },
          { value: "tron", label: "USDT (TRON)" },
        ],
      },
      { key: "address", label: "Address / invoice", placeholder: "bc1q... , lnbc... or 0x..." },
      { key: "amount", label: "Amount", placeholder: "0.005", type: "number", optional: true },
      { key: "note", label: "Label", placeholder: "Invoice 2026-014", optional: true },
    ],
    build: (v) => {
      const addr = clean(v.address);
      if (!addr) return "";
      const network = clean(v.network) || "bitcoin";
      const amount = num(v.amount);
      if (network === "lightning") {
        return `lightning:${addr.replace(/^lightning:/i, "")}`;
      }
      if (network === "bitcoin") {
        const params: string[] = [];
        if (amount > 0) params.push(`amount=${amount}`);
        if (clean(v.note)) params.push(`label=${encodeURIComponent(clean(v.note))}`);
        return `bitcoin:${addr}${params.length ? `?${params.join("&")}` : ""}`;
      }
      if (network === "evm") {
        return `ethereum:${addr}${amount > 0 ? `?value=${amount}` : ""}`;
      }
      return addr; // TRON addresses are scanned raw by wallets
    },
  },
];

export const PAYMENT_IDS = PAYMENT_METHODS.map((m) => m.id);

export function getPaymentMethod(id: string): PaymentMethod | undefined {
  return PAYMENT_METHODS.find((m) => m.id === id);
}

export function isPaymentType(id: string): id is PaymentId {
  return (PAYMENT_IDS as string[]).includes(id);
}

export function buildPaymentPayload(id: string, values: Record<string, string>): string {
  const method = getPaymentMethod(id);
  if (!method) return "";
  try {
    return method.build(values);
  } catch {
    return "";
  }
}

/* ----------------------------- IBAN validation ---------------------------- */

/** ISO 13616 mod-97 check. Returns null when valid, else a short reason. */
export function validateIban(raw: string): string | null {
  const v = (raw || "").replace(/\s+/g, "").toUpperCase();
  if (!v) return null;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{6,30}$/.test(v)) return "IBAN format looks wrong.";
  const rearranged = v.slice(4) + v.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1 ? null : "This IBAN fails its checksum.";
}

/**
 * Why a parsed inbound bank reference is not (yet) an activated membership.
 * Returns null when the reference is fully matched and paid.
 */
export function inboundFailureReason(row: {
  matched: boolean;
  status: string | null;
}): string | null {
  if (!row.matched) {
    return "No verification payment exists for this reference. It was parsed from the bank e-mail, but no member ever requested it — a typo in the transfer description, or the payment row was removed.";
  }
  if (row.status === "paid") return null;
  if (row.status === "failed") {
    return "The linked payment was rejected by an admin. Reopen it before reprocessing.";
  }
  return "The payment row exists but was never activated — the e-mail arrived before the payment row existed, or activation failed mid-way. Reprocess to retry the matcher.";
}

/** Column order of the Inbound Payments CSV export (kept in one place so the UI and its test agree). */
export const INBOUND_CSV_COLUMNS = [
  "Payment ID",
  "Timestamp",
  "Amount",
  "Currency",
  "Parsed Reference",
  "Matched User",
  "Status",
  "Error Reason",
] as const;

export type InboundExportRow = {
  eventId: string;
  reference: string;
  receivedAt: string;
  matched: boolean;
  status: string | null;
  amountCents: number | null;
  donationCents: number | null;
  username: string | null;
  email: string | null;
};

/**
 * Maps the inbound rows *currently rendered in the table* to CSV records.
 * Pure on purpose: the export must contain exactly the filtered rows, so this
 * takes the same array the table renders and never re-queries.
 */
export function inboundCsvRows(rows: InboundExportRow[]): Record<string, string>[] {
  return rows.map((r) => ({
    "Payment ID": r.eventId,
    Timestamp: r.receivedAt,
    Amount:
      r.amountCents === null ? "" : ((r.amountCents + (r.donationCents ?? 0)) / 100).toFixed(2),
    Currency: r.amountCents === null ? "" : "EUR",
    "Parsed Reference": r.reference,
    "Matched User": r.username ? `@${r.username}` : (r.email ?? ""),
    Status: r.matched ? (r.status ?? "matched") : "unmatched",
    "Error Reason": inboundFailureReason(r) ?? "",
  }));
}
