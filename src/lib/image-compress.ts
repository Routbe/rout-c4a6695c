import { TIP_IMAGE_MAX_BYTES, TIP_IMAGE_MAX_PX } from "@/lib/tip-rules";

/** Verkleint een foto in de browser naar max 2000 px en WebP; zakt in kwaliteit tot onder de bytelimiet. */
export async function compressToWebp(blob: Blob, maxPx = TIP_IMAGE_MAX_PX, maxBytes = TIP_IMAGE_MAX_BYTES): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return blob;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  for (const q of [0.86, 0.8, 0.72, 0.62]) {
    const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", q));
    if (out && out.type === "image/webp" && out.size <= maxBytes) return out;
  }
  const jpg = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.8));
  return jpg ?? blob;
}
