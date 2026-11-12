import QRCodeStyling, { DotType, CornerSquareType, CornerDotType } from "qr-code-styling";
import type { BodyShape } from "@/components/BodyShapeSelector";

const bodyShapeToDotType: Record<BodyShape, DotType> = {
  square: "square",
  dots: "dots",
  rounded: "rounded",
  classy: "classy",
  sharp: "classy-rounded",
  // Artistic styles are drawn by our own renderer; these are the raster fallbacks.
  calligraphy: "classy",
  ballpoint: "rounded",
  chalk: "dots",
  mesh: "dots",
};
const bodyShapeToCornerSquareType: Record<BodyShape, CornerSquareType> = {
  square: "square",
  dots: "dot",
  rounded: "extra-rounded",
  classy: "extra-rounded",
  sharp: "square",
  calligraphy: "extra-rounded",
  ballpoint: "square",
  chalk: "extra-rounded",
  mesh: "extra-rounded",
};
const bodyShapeToCornerDotType: Record<BodyShape, CornerDotType> = {
  square: "square",
  dots: "dot",
  rounded: "dot",
  classy: "dot",
  sharp: "square",
  calligraphy: "dot",
  ballpoint: "square",
  chalk: "dot",
  mesh: "dot",
};

export interface QRExportOpts {
  data: string;
  size: number;
  margin?: number;
  format: "png" | "svg" | "jpeg";
  fgColor: string;
  bgColor: string;
  bodyShape?: BodyShape;
  logo?: string | null;
}

export function buildQRCode(opts: QRExportOpts): QRCodeStyling {
  const shape = opts.bodyShape ?? "square";
  return new QRCodeStyling({
    width: opts.size,
    height: opts.size,
    margin: opts.margin ?? 10,
    type: opts.format === "svg" ? "svg" : "canvas",
    data: opts.data,
    dotsOptions: { color: opts.fgColor, type: bodyShapeToDotType[shape] },
    cornersSquareOptions: { color: opts.fgColor, type: bodyShapeToCornerSquareType[shape] },
    cornersDotOptions: { color: opts.fgColor, type: bodyShapeToCornerDotType[shape] },
    backgroundOptions: { color: opts.bgColor || "#FFFFFF" },
    imageOptions: { crossOrigin: "anonymous", margin: 10 },
    image: opts.logo || undefined,
    qrOptions: { errorCorrectionLevel: "H" },
  });
}

export async function getQRBlob(opts: QRExportOpts): Promise<Blob> {
  const qr = buildQRCode(opts);
  const raw = await qr.getRawData(opts.format);
  if (!raw) throw new Error("Failed to render QR");
  if (raw instanceof Blob) return raw;
  // Deno Buffer fallback
  return new Blob([raw as BlobPart], {
    type: opts.format === "svg" ? "image/svg+xml" : `image/${opts.format}`,
  });
}

export function sanitizeFilename(name: string): string {
  return (name || "qrcode").replace(/[/\\?%*:|"<>]/g, "").trim() || "qrcode";
}

export function applyFilenameTokens(
  pattern: string,
  ctx: { index: number; value: string; name?: string },
): string {
  const safe = (s: string) => s.replace(/[/\\?%*:|"<>]/g, "").slice(0, 80);
  const resolve = (key: string): string => {
    if (key === "index") return String(ctx.index).padStart(3, "0");
    if (key === "value") return safe(ctx.value);
    if (key === "name") return safe(ctx.name ?? "");
    return "";
  };
  return sanitizeFilename(
    (pattern || "qr-{index}").replace(/\{([a-z|]+)\}/gi, (_m, expr: string) => {
      for (const k of expr.split("|")) {
        const v = resolve(k.trim().toLowerCase());
        if (v) return v;
      }
      return "";
    }),
  );
}
