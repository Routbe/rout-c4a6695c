/**
 * Client-side image compression. Every upload is downscaled and re-encoded to
 * WebP before it ever reaches storage, which keeps ROUT's hosting costs near
 * zero. Video uploads are deliberately unsupported — embeds only.
 */

export const MAX_IMAGE_KB = 200;
const MAX_DIMENSION = 1000;

/** Compresses a raster image to WebP, shrinking quality until it fits `maxKB`. */
export async function compressImageToWebP(file: File, maxKB = MAX_IMAGE_KB): Promise<Blob> {
  // Small PNG/WebP files keep their original bytes, so transparency stays exact.
  if ((file.type === "image/png" || file.type === "image/webp") && file.size <= maxKB * 1024) return file;
  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);

  let width = img.width;
  let height = img.height;
  if (width > height && width > MAX_DIMENSION) {
    height = Math.round((height * MAX_DIMENSION) / width);
    width = MAX_DIMENSION;
  } else if (height > MAX_DIMENSION) {
    width = Math.round((width * MAX_DIMENSION) / height);
    height = MAX_DIMENSION;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable in this browser");
  ctx.drawImage(img, 0, 0, width, height);

  // Step the quality down until the blob fits the budget.
  let blob = await toBlob(canvas, 0.8);
  for (const quality of [0.65, 0.5, 0.4, 0.3]) {
    if (blob.size <= maxKB * 1024) break;
    blob = await toBlob(canvas, quality);
  }
  if (blob.size > maxKB * 1024) {
    throw new Error(`Image is still ${Math.round(blob.size / 1024)} KB after compression`);
  }
  return blob;
}

/** Guard used by upload inputs: images only, never video. */
export function assertUploadableImage(file: File) {
  if (file.type.startsWith("video/")) {
    throw new Error("Video uploads are disabled — embed a YouTube, PeerTube or Vimeo URL instead.");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files can be uploaded.");
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode image"));
    img.src = src;
  });
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas compression failed"))),
      "image/webp",
      quality,
    );
  });
}
