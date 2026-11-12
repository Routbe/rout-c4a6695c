/**
 * Centre-logo image helpers.
 *
 * The uploaded logo is kept in its original form; rounding is applied as a
 * derived copy so the corner slider can be moved back and forth without
 * degrading the source image.
 */

/**
 * Redraw an image inside a rounded-rect mask.
 *
 * @param src      original data URL / URL of the logo
 * @param radiusPct corner radius as a percentage of the shortest side (0–50)
 * @returns a PNG data URL, or the original source when it cannot be processed
 */
export async function roundImageDataUrl(src: string, radiusPct: number): Promise<string> {
  if (!src) return src;
  const pct = Math.max(0, Math.min(50, radiusPct));
  if (pct === 0) return src;
  try {
    const img = await loadImage(src);
    const size = Math.max(64, Math.min(512, Math.max(img.naturalWidth, img.naturalHeight) || 256));
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return src;
    const r = (size * pct) / 100;
    ctx.beginPath();
    // Rounded rect without relying on the (still patchy) roundRect API.
    ctx.moveTo(r, 0);
    ctx.lineTo(size - r, 0);
    ctx.quadraticCurveTo(size, 0, size, r);
    ctx.lineTo(size, size - r);
    ctx.quadraticCurveTo(size, size, size - r, size);
    ctx.lineTo(r, size);
    ctx.quadraticCurveTo(0, size, 0, size - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.clip();
    // Contain the artwork inside the square so nothing gets cropped.
    const scale = Math.min(size / (img.naturalWidth || size), size / (img.naturalHeight || size));
    const w = (img.naturalWidth || size) * scale;
    const h = (img.naturalHeight || size) * scale;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    return canvas.toDataURL("image/png");
  } catch {
    // A tainted or unreadable image must never break the studio.
    return src;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("logo could not be decoded"));
    img.src = src;
  });
}
