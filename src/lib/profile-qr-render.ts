import type { ProfileQrStyle } from "./profile-qr";
import { qrBackgroundSvg } from "./qr-background";

/** Browser-only execution; imports the generator's renderer after hydration. */
export async function renderProfileQr(url: string, style: ProfileQrStyle): Promise<{ svg: string; png: string }> {
  const { default: QRCodeStyling } = await import("qr-code-styling");
  const qr = new QRCodeStyling({
    width: 512, height: 512, margin: 16, type: "svg", data: url,
    dotsOptions: { color: style.fgColor, type: (style.dotStyle ?? (style.cornerStyle === "dots" ? "dots" : style.cornerStyle === "smooth" ? "rounded" : "square")) as never },
    cornersSquareOptions: { color: style.fgColor, type: (style.outerCornerStyle ?? "square") as never },
    cornersDotOptions: { color: style.fgColor, type: (style.innerCornerStyle ?? "square") as never },
    backgroundOptions: { color: "transparent" },
    image: style.logo || undefined,
    imageOptions: { crossOrigin: "anonymous", saveAsBlob: true, imageSize: style.logoSize ?? 0.4, margin: style.logoMargin ?? 10, hideBackgroundDots: style.hideBackgroundDots ?? true },
    qrOptions: { errorCorrectionLevel: "H" },
  });
  const raw = await qr.getRawData("svg");
  if (!(raw instanceof Blob)) throw new Error("qr_render_failed");
  const source = (await raw.text()).replace(/(<svg\b[^>]*>)/, `$1${qrBackgroundSvg(style.bgColor, style.bgGradient)}`);
  const svg = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  const image = new Image();
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("qr_render_failed")); image.src = svg; });
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("qr_render_failed");
  context.drawImage(image, 0, 0);
  return { svg, png: canvas.toDataURL("image/png") };
}