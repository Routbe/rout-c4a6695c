/**
 * Client-side beeldcompressie via HTML5 Canvas.
 *
 * Favicons hoeven nooit groter dan 64×64 te zijn, dus schalen we in de browser
 * en slaan we een lichte WebP data-URL op. Zo blijft de databasepayload klein
 * (< 15 KB) zonder dat er een uploadbucket nodig is.
 */

export const FAVICON_MAX_DIMENSION = 64;
export const FAVICON_MAX_BYTES = 15 * 1024;

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/webp", "image/jpeg", "image/svg+xml"];

export function isAcceptedImage(file: File): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(file.type);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image_decode_failed"));
    };
    img.src = url;
  });
}

/** Ruwe grootte van een data-URL in bytes (base64 → 3/4). */
export function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.floor((base64.length * 3) / 4);
}

/**
 * Schaalt naar max 64×64 en zoekt de hoogste kwaliteit die onder 15 KB blijft.
 * WebP eerst, PNG als de browser geen WebP kan encoderen.
 */
export async function compressFavicon(file: File): Promise<string> {
  if (!isAcceptedImage(file)) throw new Error("unsupported_type");

  const img = await loadImage(file);
  const scale = Math.min(1, FAVICON_MAX_DIMENSION / Math.max(img.width || 1, img.height || 1));
  const width = Math.max(1, Math.round((img.width || FAVICON_MAX_DIMENSION) * scale));
  const height = Math.max(1, Math.round((img.height || FAVICON_MAX_DIMENSION) * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);

  for (const [type, quality] of [
    ["image/webp", 0.9],
    ["image/webp", 0.7],
    ["image/webp", 0.5],
    ["image/png", 1],
  ] as const) {
    const url = canvas.toDataURL(type, quality);
    if (url.startsWith(`data:${type}`) && dataUrlBytes(url) <= FAVICON_MAX_BYTES) return url;
  }

  // Laatste redmiddel: harder terugschalen naar 32×32 PNG.
  const small = document.createElement("canvas");
  small.width = 32;
  small.height = 32;
  small.getContext("2d")?.drawImage(canvas, 0, 0, 32, 32);
  const fallback = small.toDataURL("image/png");
  if (dataUrlBytes(fallback) > FAVICON_MAX_BYTES) throw new Error("too_large");
  return fallback;
}
