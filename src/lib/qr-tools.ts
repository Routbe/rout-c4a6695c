import { pathCardMeta } from "@/lib/path-cards";
/**
 * Scalable template system for the flat QR tool pages on the root domain
 * (`/iban-qr`, `/wifi-qr`, `/vcard-qr`).
 *
 * Every tool is pure data: the fields it asks for, how those fields become a
 * QR payload, its brochure copy and its SEO/Schema.org metadata. Adding a new
 * tool means adding one entry here plus a three-line route file — no new UI.
 *
 * Client-safe: payload building is 100% local, nothing is ever sent anywhere.
 */

import { buildEpcPayload } from "./epc-qr";
import { SITE_ORIGIN } from "./site";

export type ToolFieldType = "text" | "email" | "tel" | "url" | "amount" | "password" | "select";

export interface ToolField {
  name: string;
  label: string;
  type: ToolFieldType;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  maxLength?: number;
  /** Half-width on desktop, so two fields share one row. */
  half?: boolean;
}

export type ToolValues = Record<string, string>;

export interface BrochureSection {
  heading: string;
  body: string;
  /** Optional bullet list rendered under the paragraph. */
  points?: string[];
}

export interface QrTool {
  slug: string;
  /** Short label, used in breadcrumbs and headings. */
  name: string;
  /** One-line promise shown above the generator. */
  tagline: string;
  /** SEO */
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  /** The standard this tool implements, for the brochure eyebrow. */
  standard: string;
  fields: ToolField[];
  /** Returns the raw QR payload, or null when input is incomplete/invalid. */
  buildPayload: (values: ToolValues) => string | null;
  /** Message shown while the payload is still null. */
  emptyHint: string;
  /** Suggested download filename (without extension). */
  filename: (values: ToolValues) => string;
  brochure: BrochureSection[];
  faq: Array<{ q: string; a: string }>;
}

/* ------------------------------------------------------------------ escaping */

/** MECARD/vCard style escaping for WIFI payloads: \ ; , : " must be escaped. */
function escapeWifi(value: string): string {
  return value.replace(/([\\;,:"])/g, "\\$1");
}

function amountToCents(raw: string): number {
  const normalized = (raw || "").replace(/\s/g, "").replace(",", ".");
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 100);
}

/** Loose IBAN sanity check: country code + digits, 15–34 chars, mod-97 valid. */
export function isPlausibleIban(raw: string): boolean {
  const iban = (raw || "").replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}[0-9A-Z]{13,32}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const digit of numeric) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

function slugify(value: string, fallback: string): string {
  const slug = (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || fallback;
}

/* -------------------------------------------------------------------- tools */

const ibanTool: QrTool = {
  slug: "iban-qr",
  name: "IBAN QR",
  tagline: "Turn a bank transfer into one scan. No typos, no wrong reference.",
  metaTitle: "IBAN QR code generator (SEPA / EPC069-12) — free & client-side | ROUT",
  metaDescription:
    "Create a SEPA payment QR code from an IBAN, amount and reference. Built on the EPC069-12 standard, generated entirely in your browser — no account, no tracking.",
  keywords: ["iban qr code", "sepa qr code", "epc qr", "scan2pay", "payment qr code"],
  standard: "EPC069-12 · SEPA Credit Transfer",
  fields: [
    {
      name: "beneficiary",
      label: "Account holder",
      type: "text",
      placeholder: "ROUT BV",
      required: true,
      maxLength: 70,
    },
    {
      name: "iban",
      label: "IBAN",
      type: "text",
      placeholder: "BE71 0961 2345 6769",
      required: true,
      hint: "Checked locally with the IBAN mod-97 checksum.",
    },
    { name: "amount", label: "Amount (EUR)", type: "amount", placeholder: "24,50", half: true },
    { name: "bic", label: "BIC (optional)", type: "text", placeholder: "GKCCBEBB", half: true },
    {
      name: "reference",
      label: "Reference",
      type: "text",
      placeholder: "Invoice 2026-014",
      maxLength: 140,
    },
  ],
  buildPayload: (v) => {
    if (!isPlausibleIban(v["iban"] ?? "")) return null;
    return buildEpcPayload({
      beneficiary: v["beneficiary"] ?? "",
      iban: v["iban"] ?? "",
      bic: v["bic"] ?? "",
      amountCents: amountToCents(v["amount"] ?? ""),
      reference: v["reference"] ?? "",
    });
  },
  emptyHint: "Enter an account holder and a valid IBAN to see your QR code.",
  filename: (v) => `iban-qr-${slugify(v["beneficiary"] ?? "", "payment")}`,
  brochure: [
    {
      heading: "What a SEPA payment QR actually contains",
      body: "An IBAN QR code is not a link and not an app. It is twelve lines of plain text defined by the European Payments Council in EPC069-12: a service tag, a version, the character set, the transfer type, an optional BIC, the beneficiary, the IBAN, the amount, a purpose code and the remittance information. Your banking app reads those lines and pre-fills its own transfer screen — the payment itself never leaves your bank.",
      points: [
        "Maximum payload: 331 bytes — long references are the usual reason a code stops fitting.",
        "An empty amount produces an open-amount QR: the payer decides what to send.",
        "The BIC is optional in version 002 and ignored by most European banks.",
      ],
    },
    {
      heading: "Why it removes the two classic transfer mistakes",
      body: "Manual transfers fail in exactly two ways: a mistyped IBAN and a missing or wrong reference. Both are encoded here, so the payer can neither guess nor fat-finger them. We validate the IBAN in your browser with the mod-97 checksum before the code is even drawn, which catches transposed digits immediately.",
    },
    {
      heading: "Client-side by design",
      body: "Payment details are among the most sensitive strings a person will ever paste into a website. This generator therefore never sends them anywhere: the payload is assembled and rendered in your own browser, the download happens from local memory, and there is no analytics, no cookie and no server log of your IBAN. Close the tab and nothing remains.",
      points: [
        "No account required, no request to our backend while you type.",
        "Static, tracking-free QR: the code encodes the payment, not a redirect through us.",
        "Works offline once the page is loaded.",
      ],
    },
    {
      heading: "The ROUT philosophy",
      body: "Most QR generators are link shorteners with a paywall in front and a tracker behind. We think a QR code is a link, not a surveillance device. Tools like this one stay free, static and anonymous; the paid part of ROUT is the ownership layer around your own domain and profile, never the act of encoding a payment.",
    },
  ],
  faq: [
    {
      q: "Is an IBAN QR code safe to share publicly?",
      a: "Yes. An IBAN plus account holder is the same information printed on any invoice: it lets people pay you, not withdraw from you. Only add a reference you are comfortable being read.",
    },
    {
      q: "Which banks support scanning it?",
      a: "Practically every European banking app that offers a 'scan to pay' or 'scan QR' option supports EPC069-12, including Belgian, Dutch, German, French and Austrian banks.",
    },
    {
      q: "Does the QR expire or track scans?",
      a: "No. The code is static and self-contained; it does not route through ROUT, so there is nothing to expire and nothing to count.",
    },
  ],
};

const wifiTool: QrTool = {
  slug: "wifi-qr",
  name: "WiFi QR",
  tagline: "Let guests join your network without ever spelling out the password.",
  metaTitle: "WiFi QR code generator — share your network safely | ROUT",
  metaDescription:
    "Generate a WiFi QR code for WPA2/WPA3, WEP or open networks. Your SSID and password are encoded in your browser only — no upload, no account, no tracking.",
  keywords: ["wifi qr code", "wifi qr generator", "wpa2 qr code", "guest wifi qr"],
  standard: "WIFI: URI scheme · Android/iOS native",
  fields: [
    {
      name: "ssid",
      label: "Network name (SSID)",
      type: "text",
      placeholder: "ROUT-Guest",
      required: true,
    },
    {
      name: "security",
      label: "Security",
      type: "select",
      half: true,
      options: [
        { value: "WPA", label: "WPA / WPA2 / WPA3" },
        { value: "WEP", label: "WEP (legacy)" },
        { value: "nopass", label: "Open (no password)" },
      ],
    },
    {
      name: "hidden",
      label: "Hidden network",
      type: "select",
      half: true,
      options: [
        { value: "false", label: "No — broadcasts its name" },
        { value: "true", label: "Yes — hidden SSID" },
      ],
    },
    {
      name: "password",
      label: "Password",
      type: "password",
      placeholder: "••••••••",
      hint: "Never leaves this device.",
    },
  ],
  buildPayload: (v) => {
    const ssid = (v["ssid"] ?? "").trim();
    if (!ssid) return null;
    const security = v["security"] || "WPA";
    const password = v["password"] ?? "";
    if (security !== "nopass" && password.length < 1) return null;
    const parts = [`S:${escapeWifi(ssid)}`];
    parts.push(`T:${security === "nopass" ? "nopass" : security}`);
    if (security !== "nopass") parts.push(`P:${escapeWifi(password)}`);
    if (v["hidden"] === "true") parts.push("H:true");
    return `WIFI:${parts.join(";")};;`;
  },
  emptyHint: "Enter a network name and password to see your QR code.",
  filename: (v) => `wifi-qr-${slugify(v["ssid"] ?? "", "network")}`,
  brochure: [
    {
      heading: "The WIFI: URI scheme, in plain terms",
      body: "A WiFi QR code is a single line of text: WIFI:S:<name>;T:<security>;P:<password>;;. Android has parsed it natively since 10, iOS since 11, and every serious camera app understands it. Scanning does not connect you silently — the phone shows a confirmation sheet with the network name first.",
      points: [
        "T:WPA covers WPA, WPA2 and WPA3 — there is no separate WPA3 tag.",
        'Special characters (; , : \\ ") are escaped with a backslash, which this tool does for you.',
        "H:true is required for hidden networks, otherwise the phone will not find them.",
      ],
    },
    {
      heading: "Why this is better than reciting a password",
      body: "A guest password shouted across a room, written on a whiteboard or typed into someone else's phone is a password you no longer control. A printed QR keeps the string out of conversation and out of chat apps, and it lets you use a genuinely long random password because nobody has to type it.",
    },
    {
      heading: "Where the privacy line sits",
      body: "The password is encoded in the code itself — that is how the standard works — so treat the printed QR exactly like the password: fine on a table in your own café, not fine on a public Instagram post. What matters is that the string never travelled through a server. Your SSID and password are combined and drawn locally in this browser tab.",
      points: [
        "Nothing is uploaded, logged or cached on our side.",
        "Use your router's guest network so the code cannot reach your internal devices.",
        "Rotate the guest password and reprint: the QR costs nothing to regenerate.",
      ],
    },
    {
      heading: "The ROUT philosophy",
      body: "Tools that handle secrets should be boring, static and offline-capable. No sign-up wall, no watermark, no 'upgrade to remove tracking'. ROUT sells ownership of your links and profile, not access to arithmetic that your own browser can do.",
    },
  ],
  faq: [
    {
      q: "Can someone read my password from the QR code?",
      a: "Yes — any scanner can decode it, because the password is part of the payload. Print it where you would be comfortable writing the password itself, and prefer a guest network.",
    },
    {
      q: "Does it work on iPhone and Android?",
      a: "Both. iOS 11+ and Android 10+ handle WiFi QR codes in the native camera; older Androids need a QR app.",
    },
    {
      q: "Does WPA3 need a different code?",
      a: "No. WPA3 networks are encoded with T:WPA, exactly like WPA2.",
    },
  ],
};

const vcardTool: QrTool = {
  slug: "vcard-qr",
  name: "vCard QR",
  tagline: "One scan, one contact card — saved to the phone, not to a platform.",
  metaTitle: "vCard QR code generator — digital business card, no tracking | ROUT",
  metaDescription:
    "Create a vCard 3.0 QR code with name, phone, email, company and website. Generated client-side in your browser: no account, no redirect, no scan tracking.",
  keywords: ["vcard qr code", "contact qr code", "digital business card qr", "mecard"],
  standard: "vCard 3.0 · RFC 6350 lineage",
  fields: [
    {
      name: "firstName",
      label: "First name",
      type: "text",
      placeholder: "Jona",
      half: true,
      required: true,
    },
    { name: "lastName", label: "Last name", type: "text", placeholder: "Delplanche", half: true },
    { name: "organization", label: "Company", type: "text", placeholder: "ROUT", half: true },
    { name: "title", label: "Role", type: "text", placeholder: "Founder", half: true },
    { name: "phone", label: "Phone", type: "tel", placeholder: "+32 470 00 00 00", half: true },
    { name: "email", label: "Email", type: "email", placeholder: "hi@rout.be", half: true },
    { name: "website", label: "Website", type: "url", placeholder: "https://rout.be" },
  ],
  buildPayload: (v) => {
    const first = (v["firstName"] ?? "").trim();
    const last = (v["lastName"] ?? "").trim();
    if (!first && !last) return null;
    const esc = (s: string) => s.replace(/([\\;,])/g, "\\$1").replace(/\n/g, "\\n");
    const lines = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `N:${esc(last)};${esc(first)};;;`,
      `FN:${esc([first, last].filter(Boolean).join(" "))}`,
    ];
    if (v["organization"]) lines.push(`ORG:${esc(v["organization"])}`);
    if (v["title"]) lines.push(`TITLE:${esc(v["title"])}`);
    if (v["phone"]) lines.push(`TEL;TYPE=CELL:${esc(v["phone"])}`);
    if (v["email"]) lines.push(`EMAIL;TYPE=INTERNET:${esc(v["email"])}`);
    if (v["website"]) lines.push(`URL:${esc(v["website"])}`);
    lines.push("END:VCARD");
    return lines.join("\n");
  },
  emptyHint: "Enter at least a name to see your QR code.",
  filename: (v) =>
    `vcard-qr-${slugify(`${v["firstName"] ?? ""} ${v["lastName"] ?? ""}`, "contact")}`,
  brochure: [
    {
      heading: "vCard, not a landing page",
      body: "A vCard QR encodes the contact card itself: BEGIN:VCARD, a structured name, phone, email, organisation and URL, then END:VCARD. The phone parses it and offers to save a contact. There is no intermediate website, so the card keeps working when a service shuts down, a subscription lapses or the venue has no signal.",
      points: [
        "vCard 3.0 is the version every phone reads reliably; 4.0 gains little in a QR.",
        "Keep it lean: photos and long notes push the code into dense, hard-to-scan territory.",
        "Semicolons and commas are escaped automatically in this generator.",
      ],
    },
    {
      heading: "Why 'smart' business-card platforms are a downgrade",
      body: "Most digital business cards point at a hosted profile so the vendor can count scans and gate features. That turns your contact details into someone else's funnel, and turns a paper card that worked for a decade into a URL that can rot. A static vCard has no owner in the middle.",
    },
    {
      heading: "Privacy considerations",
      body: "Everything you type here stays in this tab: the vCard text is assembled locally and rendered by your own browser. We never see the contact, so we cannot lose it, sell it or correlate it. If you do want scan counts and an updatable card later, that is what a ROUT profile at rout.be/yourname is for — an explicit, owned choice rather than a hidden default.",
      points: [
        "No upload, no analytics, no cookie set by this tool.",
        "Static code: no redirect through ROUT, so no scan log exists.",
        "Print, engrave or ship it — the payload never changes behind your back.",
      ],
    },
    {
      heading: "The ROUT philosophy",
      body: "Own your identity, rent nothing. Free tools stay free and unmetered; the paid layer is the part that genuinely needs a home on a server — your handle, your domain, your routed links.",
    },
  ],
  faq: [
    {
      q: "Will the QR still work in five years?",
      a: "Yes. A vCard QR is self-contained, so it does not depend on our servers, your subscription or any redirect staying alive.",
    },
    {
      q: "Can I track how often my card is scanned?",
      a: "Not with a static vCard — there is nothing in the middle to count. Scan statistics require a routed link, which is what a ROUT profile or short link provides.",
    },
    {
      q: "Should I add a photo to the vCard?",
      a: "Better not. An embedded image makes the payload huge and the code much harder to scan from a printed card.",
    },
  ],
};

export const QR_TOOLS = [ibanTool, wifiTool, vcardTool] as const;

export const QR_TOOL_BY_SLUG: Record<string, QrTool> = Object.fromEntries(
  QR_TOOLS.map((tool) => [tool.slug, tool]),
);

export function getQrTool(slug: string): QrTool | undefined {
  return QR_TOOL_BY_SLUG[slug];
}

/* ---------------------------------------------------------------- metadata */

/** Route `head()` payload: unique title/description/OG + canonical per tool. */
export function toolHead(tool: QrTool) {
  const url = `${SITE_ORIGIN}/${tool.slug}`;
  return {
    meta: [
      { title: tool.metaTitle },
      { name: "description", content: tool.metaDescription },
      { name: "keywords", content: tool.keywords.join(", ") },
      { property: "og:title", content: tool.metaTitle },
      { property: "og:description", content: tool.metaDescription },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { name: "twitter:card", content: "summary_large_image" },
      ...pathCardMeta(`/${tool.slug}`),
    ],
    links: [{ rel: "canonical", href: url }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(toolJsonLd(tool)),
      },
    ],
  };
}

/** Schema.org graph: the tool as SoftwareApplication + its FAQ. */
export function toolJsonLd(tool: QrTool) {
  const url = `${SITE_ORIGIN}/${tool.slug}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "@id": `${url}#app`,
        name: tool.metaTitle.split("—")[0]?.trim() || tool.name,
        url,
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Any (web browser)",
        description: tool.metaDescription,
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
        publisher: { "@type": "Organization", name: "ROUT", url: SITE_ORIGIN },
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: tool.faq.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  };
}
