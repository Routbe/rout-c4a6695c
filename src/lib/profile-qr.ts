import { bunny } from "@/lib/brand/logo";
import qrcode from "qrcode-generator";

/**
 * Centrale ROUT QR-engine voor profielen.
 *
 * Elke profiel-QR encodeert altijd de soevereine dynamische ROUT-URL
 * (`https://rout.be/<handle>` of `https://rout.be/u/<handle>`), zodat een
 * geprinte code nooit verouderd raakt: de bestemming verandert in de Studio,
 * niet op papier.
 */

export type QrCornerStyle = "square" | "dots" | "smooth";

export interface ProfileQrStyle {
  fgColor: string;
  bgColor: string;
  cornerStyle: QrCornerStyle;
  /** ROUT Rabbit-embleem in het midden van de code. */
  emblem: boolean;
  /** Volledig generator-ontwerp (optioneel, oudere opslag heeft dit niet). */
  dotStyle?: string;
  outerCornerStyle?: string;
  innerCornerStyle?: string;
  /** CSS-achtergrond (bv. linear-gradient) uit de ontwerper. */
  bgGradient?: string | null;
  /** Eigen logo (https-URL of kleine data-URI). Geen logo = niets in het midden. */
  logo?: string | null;
  logoSize?: number;
  logoMargin?: number;
  hideBackgroundDots?: boolean;
}

export const DEFAULT_PROFILE_QR_STYLE: ProfileQrStyle = {
  fgColor: "#1A1A1A",
  bgColor: "#FFFFFF",
  cornerStyle: "square",
  emblem: false,
};

export const CORNER_STYLES: { id: QrCornerStyle; label: string }[] = [
  { id: "square", label: "Vierkant" },
  { id: "dots", label: "Stippen" },
  { id: "smooth", label: "Zacht" },
];

/** Corner matrix-stijl → de body/dot-stijl van onze render-engine. */
export function bodyShapeFor(style: QrCornerStyle): "square" | "dots" | "rounded" {
  if (style === "dots") return "dots";
  if (style === "smooth") return "rounded";
  return "square";
}

/* --------------------------------------------------------- vector matrix */

export interface QrMatrixData {
  count: number;
  /** `true` = donkere module. */
  cells: boolean[][];
}

export function profileQrMatrix(data: string): QrMatrixData {
  const qr = qrcode(0, "H");
  qr.addData(data);
  qr.make();
  const count = qr.getModuleCount();
  const cells: boolean[][] = [];
  for (let y = 0; y < count; y += 1) {
    const row: boolean[] = [];
    for (let x = 0; x < count; x += 1) row.push(qr.isDark(y, x));
    cells.push(row);
  }
  return { count, cells };
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean.padEnd(6, "0").slice(0, 6);
  const int = Number.parseInt(full, 16);
  if (!Number.isFinite(int)) return [0, 0, 0];
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function pdfColor(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `${(r / 255).toFixed(4)} ${(g / 255).toFixed(4)} ${(b / 255).toFixed(4)}`;
}

/** Is deze module deel van het uitgespaarde middenvlak voor het embleem? */
function inEmblemZone(x: number, y: number, count: number): boolean {
  const half = Math.max(2, Math.round(count * 0.09));
  const center = (count - 1) / 2;
  return Math.abs(x - center) <= half && Math.abs(y - center) <= half;
}

/* ------------------------------------------------------------- SVG export */

/**
 * ROUT Rabbit-embleem als inline vector op een 100×100 canvas. Inline (geen
 * <image href>) zodat elke export zelfstandig blijft: geen CORS, geen
 * ontbrekende assets bij het printen.
 */
export function routRabbitMarkup(color: string): string {
  // Altijd het officiële ROUT-konijn (brand/logo), nooit een eigen tekening.
  return `<rect width="100" height="100" rx="18" fill="${color}"/>${bunny(22, 13, 56, "#FFFFFF")}`;
}

/**
 * Print-klare vector-SVG. Volledig zelf gerenderd zodat de export exact
 * overeenkomt met de PDF (dezelfde modules, dezelfde uitsparing).
 */
export function profileQrSvg(
  data: string,
  style: ProfileQrStyle,
  options: { size?: number; margin?: number } = {},
): string {
  const size = options.size ?? 1024;
  const margin = options.margin ?? 4;
  const { count, cells } = profileQrMatrix(data);
  const total = count + margin * 2;
  const unit = size / total;
  const shape = bodyShapeFor(style.cornerStyle);
  const parts: string[] = [];

  for (let y = 0; y < count; y += 1) {
    for (let x = 0; x < count; x += 1) {
      if (!cells[y]![x]) continue;
      if (style.emblem && inEmblemZone(x, y, count)) continue;
      const px = (x + margin) * unit;
      const py = (y + margin) * unit;
      if (shape === "dots") {
        parts.push(
          `<circle cx="${(px + unit / 2).toFixed(2)}" cy="${(py + unit / 2).toFixed(2)}" r="${(unit / 2).toFixed(2)}"/>`,
        );
      } else {
        const radius = shape === "rounded" ? (unit * 0.3).toFixed(2) : "0";
        parts.push(
          `<rect x="${px.toFixed(2)}" y="${py.toFixed(2)}" width="${unit.toFixed(2)}" height="${unit.toFixed(2)}" rx="${radius}" ry="${radius}"/>`,
        );
      }
    }
  }

  const emblem = style.emblem
    ? (() => {
        const zone = unit * (Math.max(2, Math.round(count * 0.09)) * 2 + 1);
        const offset = (size - zone) / 2;
        return `<g transform="translate(${offset.toFixed(2)} ${offset.toFixed(2)}) scale(${(zone / 100).toFixed(4)})">${routRabbitMarkup(style.fgColor)}</g>`;
      })()
    : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">`,
    style.bgColor && style.bgColor !== "transparent"
      ? `<rect width="${size}" height="${size}" fill="${style.bgColor}"/>`
      : "",
    `<g fill="${style.fgColor}">${parts.join("")}</g>`,
    emblem,
    `</svg>`,
  ].join("");
}

/* ------------------------------------------------------------- PDF export */

/**
 * Print-PDF met echte vectorvormen (geen raster), zonder externe library.
 * Standaard 60×60 mm — het formaat van een visitekaartje-QR.
 */
export function profileQrPdf(
  data: string,
  style: ProfileQrStyle,
  options: { mm?: number; margin?: number } = {},
): Blob {
  const mm = options.mm ?? 60;
  const pt = (mm / 25.4) * 72;
  const margin = options.margin ?? 4;
  const { count, cells } = profileQrMatrix(data);
  const unit = pt / (count + margin * 2);

  const ops: string[] = [];
  if (style.bgColor && style.bgColor !== "transparent") {
    ops.push(`${pdfColor(style.bgColor)} rg`, `0 0 ${pt.toFixed(2)} ${pt.toFixed(2)} re f`);
  }
  ops.push(`${pdfColor(style.fgColor)} rg`);
  for (let y = 0; y < count; y += 1) {
    for (let x = 0; x < count; x += 1) {
      if (!cells[y]![x]) continue;
      if (style.emblem && inEmblemZone(x, y, count)) continue;
      // PDF-oorsprong ligt linksonder: y omklappen.
      const px = (x + margin) * unit;
      const py = pt - (y + margin + 1) * unit;
      ops.push(`${px.toFixed(2)} ${py.toFixed(2)} ${unit.toFixed(2)} ${unit.toFixed(2)} re f`);
    }
  }
  if (style.emblem) {
    // Massief embleemvlak in het uitgespaarde midden: netjes op print, en de
    // H-foutcorrectie blijft de code volledig scanbaar houden.
    const half = Math.max(2, Math.round(count * 0.09));
    const zone = unit * (half * 2 + 1);
    const offset = (pt - zone) / 2;
    ops.push(
      `${offset.toFixed(2)} ${offset.toFixed(2)} ${zone.toFixed(2)} ${zone.toFixed(2)} re f`,
    );
  }
  const content = ops.join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pt.toFixed(2)} ${pt.toFixed(2)}] /Contents 4 0 R /Resources << >> >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}
