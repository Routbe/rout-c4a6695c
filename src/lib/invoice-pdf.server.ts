import logoSvg from "@/assets/rout-logo.svg?raw";
/**
 * Server-only PDF factuur — met de hand opgebouwd (geen native afhankelijkheden,
 * draait dus ook in de Worker-runtime).
 *
 * Stijl: ROUT-esthetiek. Warme crème achtergrond (#FBF9F5), houtskoolzwart,
 * ultradunne haarlijnen, het konijn-embleem als fijne vectorlijntekening, en
 * een groot, sterk vervaagd "ROUT"-watermerk gedraaid in de zijmarge.
 */

import { DEFAULT_VAT_RATE, vatBreakdown } from "./invoice-vat";

/** Handelsgegevens van de verkoper; overschrijfbaar via de omgeving. */
export function merchantDetails() {
  return {
    name: process.env["ROUT_COMPANY_NAME"] ?? "ROUT",
    address: process.env["ROUT_COMPANY_ADDRESS"] ?? "Belgie",
    vat: process.env["ROUT_VAT_NUMBER"] ?? "BTW-nummer op aanvraag",
    email: process.env["ROUT_BILLING_EMAIL"] ?? "hallo@rout.be",
  };
}

export interface InvoiceLine {
  label: string;
  amountCents: number;
}

export interface InvoiceData {
  invoiceNumber: string;
  issuedAt: Date;
  customerEmail: string;
  customerName?: string | null;
  /** ROUT-handle van de klant, zonder @. */
  customerUsername?: string | null;
  /** Interne of Stripe-klantreferentie. */
  customerId?: string | null;
  lines: InvoiceLine[];
  vatCents?: number;
  totalCents: number;
  currency?: string;
  paymentMethod?: string;
  reference?: string;
  /** Factuuradres van de koper (vrije regels), indien bekend. */
  billingAddress?: string[];
  /** Btw-tarief in procent; standaard 21% (Belgie/EU). */
  vatRatePercent?: number;
  /** Transactie-ID bij de betaalprovider (Stripe/bunq). */
  transactionId?: string;
}

const CHARCOAL = "0.086 0.094 0.106";
const MUTED = "0.45 0.47 0.5";
const HAIRLINE = "0.82 0.83 0.85";
/** #FBF9F5 — de warme crèmetoon van rout.be. */
const CREAM = "0.984 0.976 0.961";
/** Watermerk: nauwelijks zichtbaar, puur textuur. */
const WATERMARK = "0.93 0.91 0.88";

/** WinAnsi-veilige tekst voor de ingebouwde Helvetica. */
function pdfText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2022/g, "-")
    .replace(/[^\x20-\x7E]/g, (ch) => (ch === "\u20AC" ? "\\200" : "?"));
}

function money(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

function text(
  x: number,
  y: number,
  size: number,
  font: "R" | "B",
  value: string,
  color = CHARCOAL,
) {
  return `BT ${color} rg /${font} ${size} Tf ${x} ${y} Td (${pdfText(value)}) Tj ET\n`;
}

function line(x1: number, y1: number, x2: number, y2: number, width = 0.4) {
  return `${HAIRLINE} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S\n`;
}

/** Volvlak achtergrond in de ROUT-crèmetoon. */
function background(w: number, h: number): string {
  return `${CREAM} rg 0 0 ${w} ${h} re f\n`;
}

/** Pad-data van het officiële ROUT-konijn (public/logo.svg), y-as omhoog. */
const LOGO_D = (logoSvg.match(/\sd="([^"]+)"/) ?? [])[1] ?? "";

/**
 * Officieel ROUT-embleem: exact de vectorvorm uit `public/logo.svg`,
 * omgezet naar PDF-padoperatoren. Nooit een eigen tekening.
 */
function bunnyEmblem(x: number, y: number, width = 20): string {
  const s = width / 10240;
  const tokens = LOGO_D.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let i = 0;
  let cmd = "";
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  const num = () => Number(tokens[i++]);
  const P = (px: number, py: number) => `${(x + px * s).toFixed(2)} ${(y - 6 + py * s).toFixed(2)}`;
  let out = `${CHARCOAL} rg\n`;
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i]!)) cmd = tokens[i++]!;
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toLowerCase()) {
      case "m": {
        const nx = num(), ny = num();
        cx = rel ? cx + nx : nx; cy = rel ? cy + ny : ny; sx = cx; sy = cy;
        out += `${P(cx, cy)} m\n`;
        cmd = rel ? "l" : "L";
        break;
      }
      case "l": {
        const nx = num(), ny = num();
        cx = rel ? cx + nx : nx; cy = rel ? cy + ny : ny;
        out += `${P(cx, cy)} l\n`;
        break;
      }
      case "c": {
        const v = [num(), num(), num(), num(), num(), num()];
        const ox = rel ? cx : 0, oy = rel ? cy : 0;
        out += `${P(ox + v[0]!, oy + v[1]!)} ${P(ox + v[2]!, oy + v[3]!)} ${P(ox + v[4]!, oy + v[5]!)} c\n`;
        cx = ox + v[4]!; cy = oy + v[5]!;
        break;
      }
      case "z":
        out += "h\n"; cx = sx; cy = sy;
        break;
      default:
        i++;
    }
  }
  return out + "f*\n";
}

/**
 * Groot, sterk vervaagd "ROUT"-watermerk, 90° gedraaid in de linkermarge.
 * De rotatiematrix staat in de tekstmatrix zelf (cos, sin, -sin, cos, x, y).
 */
function watermark(x: number, y: number): string {
  return `q BT ${WATERMARK} rg /B 54 Tf 0 1 -1 0 ${x} ${y} Tm 24 Tc (${pdfText("ROUT")}) Tj ET Q\n`;
}

function buildContent(data: InvoiceData): string {
  const currency = data.currency ?? "EUR";
  const W = 595.28;
  const H = 841.89;
  let out = background(W, H);
  out += watermark(62, 150);
  let y = 780;

  out += bunnyEmblem(56, y - 6);
  out += text(84, y - 4, 15, "B", "ROUT");
  out += text(84, y - 20, 8, "R", "rout.be", MUTED);

  out += text(W - 200, y - 4, 22, "R", "Factuur");
  out += text(W - 200, y - 22, 8.5, "R", `Nr. ${data.invoiceNumber}`, MUTED);
  out += text(W - 200, y - 34, 8.5, "R", data.issuedAt.toISOString().slice(0, 10), MUTED);

  out += text(84, y - 32, 8, "R", merchantDetails().vat, MUTED);

  y -= 74;
  out += line(56, y, W - 56, y);

  y -= 34;
  out += text(56, y, 8, "R", "GEFACTUREERD AAN", MUTED);
  let cy = y - 16;
  out += text(56, cy, 11, "R", data.customerName?.trim() || data.customerEmail);
  if (data.customerUsername?.trim()) {
    cy -= 14;
    out += text(56, cy, 9.5, "R", `@${data.customerUsername.trim().replace(/^@/, "")}`, MUTED);
  }
  if (data.customerName?.trim()) {
    cy -= 14;
    out += text(56, cy, 9.5, "R", data.customerEmail, MUTED);
  }
  for (const addressLine of data.billingAddress ?? []) {
    if (!addressLine.trim()) continue;
    cy -= 13;
    out += text(56, cy, 9.5, "R", addressLine.trim(), MUTED);
  }
  if (data.customerId?.trim()) {
    cy -= 14;
    out += text(56, cy, 8.5, "R", `Klant-ID ${data.customerId.trim()}`, MUTED);
  }

  out += text(W - 200, y, 8, "R", "BETAALWIJZE", MUTED);
  out += text(W - 200, y - 16, 11, "R", data.paymentMethod ?? "card");
  if (data.reference) out += text(W - 200, y - 30, 9.5, "R", `Ref. ${data.reference}`, MUTED);
  if (data.transactionId) {
    out += text(W - 200, y - 42, 8.5, "R", `Transactie ${data.transactionId.slice(0, 34)}`, MUTED);
  }

  y = Math.min(cy, y - 44) - 42;
  out += text(56, y, 8, "R", "OMSCHRIJVING", MUTED);
  out += text(W - 140, y, 8, "R", "BEDRAG", MUTED);
  y -= 10;
  out += line(56, y, W - 56, y);

  for (const item of data.lines) {
    y -= 26;
    out += text(56, y, 10.5, "R", item.label);
    out += text(W - 140, y, 10.5, "R", money(item.amountCents, currency));
    y -= 10;
    out += line(56, y, W - 56, y, 0.25);
  }

  // Alle ROUT-prijzen zijn btw-inclusief: netto en btw worden teruggerekend
  // vanaf het totaal, zodat de som altijd exact het betaalde bedrag geeft.
  const rate = data.vatRatePercent ?? DEFAULT_VAT_RATE;
  const split = vatBreakdown(data.totalCents, rate);
  const vatCents = typeof data.vatCents === "number" ? data.vatCents : split.vatCents;
  const netCents = data.totalCents - vatCents;

  y -= 26;
  out += text(W - 260, y, 9.5, "R", "Netto", MUTED);
  out += text(W - 140, y, 9.5, "R", money(netCents, currency), MUTED);
  y -= 16;
  out += text(W - 260, y, 9.5, "R", `BTW ${rate}%`, MUTED);
  out += text(W - 140, y, 9.5, "R", money(vatCents, currency), MUTED);

  y -= 34;
  out += line(W - 280, y + 16, W - 56, y + 16);
  out += text(W - 260, y, 12, "B", "Totaal betaald");
  out += text(W - 140, y, 12, "B", money(data.totalCents, currency));

  out += line(56, 96, W - 56, 96, 0.25);
  const merchant = merchantDetails();
  out += text(56, 78, 8, "R", `${merchant.name} — ${merchant.address} — ${merchant.email}`, MUTED);
  out += text(56, 90, 8, "R", `BTW ${merchant.vat}`, MUTED);
  out += text(
    56,
    66,
    8,
    "R",
    "Dit document is automatisch aangemaakt en is geldig zonder handtekening.",
    MUTED,
  );

  return out;
}

/** Bouwt de PDF en geeft hem terug als base64 (klaar voor Brevo-bijlage). */
export function renderInvoicePdf(data: InvoiceData): string {
  const content = buildContent(data);
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /R 5 0 R /B 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
