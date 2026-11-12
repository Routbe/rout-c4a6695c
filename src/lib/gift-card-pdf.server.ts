/**
 * Server-only PDF van de cadeaubon zelf (los van de factuur). Handmatig
 * opgebouwd, net als de factuur, zodat de Worker-runtime geen native
 * afhankelijkheden nodig heeft.
 */
import { giftDesign, euro } from "./gift-cards";

export interface GiftCardPdfData {
  code: string;
  amountCents: number;
  design: string;
  recipientName?: string | null;
  purchaserName?: string | null;
  message?: string | null;
  viewUrl: string;
}

function pdfText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x20-\x7E]/g, (ch) => (ch === "\u20AC" ? "\\200" : "?"));
}

/** #RRGGBB → "r g b" in PDF-kleurruimte. */
function rgb(hex: string): string {
  const clean = hex.replace("#", "");
  const n = parseInt(clean.length === 3 ? clean.replace(/./g, (c) => c + c) : clean, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
}

function text(x: number, y: number, size: number, font: "R" | "B", value: string, color: string) {
  return `BT ${color} rg /${font} ${size} Tf ${x} ${y} Td (${pdfText(value)}) Tj ET\n`;
}

function wrap(value: string, max: number): string[] {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > max) {
      if (line) lines.push(line.trim());
      line = word;
    } else {
      line += ` ${word}`;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines.slice(0, 5);
}

function buildContent(data: GiftCardPdfData): string {
  const design = giftDesign(data.design);
  const ink = rgb(design.ink);
  const accent = rgb(design.accent);
  const bg = rgb(design.front);

  // A5-landschap: 595.28 x 419.53
  let c = `${bg} rg 0 0 595.28 419.53 re f\n`;
  c += `${accent} RG 0.8 w 24 24 547 371 re S\n`;

  c += text(48, 340, 11, "B", "ROUT CADEAUBON", accent);
  c += text(48, 296, 34, "B", euro(data.amountCents), ink);

  let y = 250;
  if (data.recipientName) {
    c += text(48, y, 12, "R", `Voor ${data.recipientName}`, ink);
    y -= 22;
  }
  if (data.purchaserName) {
    c += text(48, y, 12, "R", `Van ${data.purchaserName}`, ink);
    y -= 22;
  }
  if (data.message) {
    for (const line of wrap(data.message, 58)) {
      c += text(48, y, 11, "R", line, ink);
      y -= 16;
    }
  }

  c += `${accent} RG 0.6 w 48 118 m 547 118 l S\n`;
  c += text(48, 90, 10, "R", "Code", accent);
  c += text(48, 66, 20, "B", data.code, ink);
  c += text(48, 42, 9, "R", `Bekijk online: ${data.viewUrl}`, accent);
  c += text(
    48,
    28,
    8,
    "R",
    "Vul de code in bij het afrekenen op rout.be. Eenmalig inwisselbaar, blijft geldig.",
    accent,
  );
  return c;
}

export function renderGiftCardPdf(data: GiftCardPdfData): string {
  const content = buildContent(data);
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 419.53] /Resources << /Font << /R 5 0 R /B 6 0 R >> >> /Contents 4 0 R >>",
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

  let binary = "";
  for (let i = 0; i < pdf.length; i++) binary += String.fromCharCode(pdf.charCodeAt(i) & 0xff);
  return btoa(binary);
}
