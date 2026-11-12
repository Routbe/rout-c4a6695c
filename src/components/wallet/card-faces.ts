/**
 * Draws both faces of the ROUT Card on 2D canvases (browser only). The same
 * images feed the WebGL card and the CSS fallback, so both look identical.
 * Portrait ID-1 ratio 1 : 1.588.
 */
import qrcode from "qrcode-generator";
import type { WalletCardPayload } from "@/lib/wallet/wallet-pass";
import { generateMRZ_TD1 } from "@/lib/wallet/card-mrz";

export const CARD_RATIO = 1.588;
export const FACE_W = 640;
export const FACE_H = Math.round(FACE_W * CARD_RATIO);

/**
 * front/back: printed artwork. mask (WebGL only): R = holographic foil
 * (emblem, ring, frame), G = latent kinegram watermark, B = emboss height.
 */
export type CardFaces = { front: HTMLCanvasElement; back: HTMLCanvasElement; mask: HTMLCanvasElement; /** R = portrait opacity (transparent avatar pixels let the card materials show through). */ portrait?: HTMLCanvasElement; qrFront?: QrBox; qrBack?: QrBox };

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v + amount * 255))));
  return `rgb(${c.join(",")})`;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // A slow photo must never block the card: draw the initial instead.
    const timer = setTimeout(() => resolve(null), 4000);
    img.decoding = "async";
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = src;
  });
}

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number, size: number, weight: number) {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
    s -= 2;
  } while (ctx.measureText(text).width > max && s > 14);
}

/** Printed QR placement (canvas px): the white panel is exactly the QR + quiet zone. */
export const FRONT_QR = { x: 150, y: 512, size: 340, quiet: 2 } as const;
export const BACK_QR = { x: 200, y: Math.round(FACE_H * 0.13), size: 240, quiet: 2 } as const;
/** Front portrait and printed text lines (shared with the 3D card's SDF text). */
export const FRONT_AVATAR = { cy: 236, r: 96 } as const;
export const FRONT_TEXT_Y = { name: 400, handle: 444, sub: 480 } as const;
export type QrBox = { x: number; y: number; w: number };

/** Exact panel rectangle drawQr will paint for a layout (for shader reserve masks). */
export function qrPanel(value: string, l: { x: number; y: number; size: number; quiet: number }, ecc: "M" | "H"): QrBox {
  const qr = qrcode(0, ecc);
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount() + l.quiet * 2;
  const cell = Math.floor(l.size / n);
  const w = cell * n;
  return { x: l.x + Math.floor((l.size - w) / 2), y: l.y + Math.floor((l.size - w) / 2), w };
}

/** Crisp QR modules on a white rounded panel; quiet zone in modules (ISO min 4, 2 is reliable on a uniform surround). */
export function drawQr(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, ecc: "M" | "H" = "M", quiet = 4, radius = 0): QrBox {
  const qr = qrcode(0, ecc);
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();
  const cell = Math.floor(size / (n + quiet * 2));
  const total = cell * (n + quiet * 2);
  const ox = x + Math.floor((size - total) / 2);
  const oy = y + Math.floor((size - total) / 2);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(ox, oy, total, total, radius);
  ctx.fill();
  ctx.fillStyle = "#000000";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(ox + (c + quiet) * cell, oy + (r + quiet) * cell, cell, cell);
  return { x: ox, y: oy, w: total };
}

/** The six-point ROUT seal used as the holographic emblem. */
function drawEmblem(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI / 6) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.62;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

/** ICAO OCR-B (free outline by Schwarz/Wagner, CTAN ocr-b-outline) for the MRZ. */
let ocrb: Promise<boolean> | null = null;
function loadOcrB(): Promise<boolean> {
  if (ocrb) return ocrb;
  ocrb = typeof FontFace === "undefined"
    ? Promise.resolve(false)
    : new FontFace("ROUT OCR-B", "url(/fonts/OCR-B.otf)").load().then((f) => {
        document.fonts.add(f);
        return true;
      }).catch(() => false);
  return ocrb;
}

export async function drawCardFaces(card: Omit<WalletCardPayload, "heroImageUrl"> & { avatarPath?: string | null; regionDisplay?: string }, opts: { sdfText?: boolean; secureQr?: string | null; frontQr?: string | null; tier?: "adult" | "junior"; baseHex?: string } = {}): Promise<CardFaces> {
  const make = () => {
    const c = document.createElement("canvas");
    c.width = FACE_W;
    c.height = FACE_H;
    return c;
  };
  const front = make();
  const back = make();
  const mask = make();
  const portrait = make();
  const bg = card.hexBackgroundColor;
  const fg = card.hexForegroundColor;
  const avatar = card.avatarPath ? await loadImage(card.avatarPath) : null;

  // Front: brand gradient, pulse ring, portrait, name, handle, emblem.
  const f = front.getContext("2d")!;
  const g = f.createLinearGradient(0, 0, FACE_W, FACE_H);
  g.addColorStop(0, shade(bg, 0.08));
  g.addColorStop(1, shade(bg, -0.08));
  f.fillStyle = g;
  f.fillRect(0, 0, FACE_W, FACE_H);
  if (opts.tier === "junior") {
    // Junior tier: a livelier pattern of soft dots and waves over the brand colour.
    const jg = f.createLinearGradient(0, 0, FACE_W, FACE_H);
    jg.addColorStop(0, "rgba(56,189,248,0.35)");
    jg.addColorStop(0.5, "rgba(250,204,21,0.25)");
    jg.addColorStop(1, "rgba(52,211,153,0.35)");
    f.fillStyle = jg;
    f.fillRect(0, 0, FACE_W, FACE_H);
    f.fillStyle = "rgba(255,255,255,0.14)";
    for (let y = 24; y < FACE_H; y += 48) for (let x = (y / 48) % 2 ? 24 : 48; x < FACE_W; x += 48) {
      f.beginPath();
      f.arc(x, y + Math.sin(x / 40) * 6, 6, 0, Math.PI * 2);
      f.fill();
    }
    f.fillStyle = fg;
    f.globalAlpha = 0.8;
    f.font = `700 16px ui-sans-serif, system-ui, sans-serif`;
    f.fillText("JUNIOR", 50, 104);
    f.globalAlpha = 1;
  }
  f.fillStyle = fg;
  f.globalAlpha = 0.9;
  f.font = `700 34px ui-sans-serif, system-ui, sans-serif`;
  f.fillText("ROUT", 48, 78);
  f.globalAlpha = 0.55;
  f.font = `500 18px ui-monospace, SFMono-Regular, monospace`;
  f.textAlign = "right";
  f.fillText(card.sovereignId, FACE_W - 48, 76);
  f.textAlign = "left";
  f.globalAlpha = 1;
  const cx = FACE_W / 2;
  const cy = FRONT_AVATAR.cy;
  const r = FRONT_AVATAR.r;
  // Avatar only: a smooth disc with a light raised rim around it, no card patterns.
  const rim = f.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  rim.addColorStop(0, shade(bg, 0.32));
  rim.addColorStop(0.5, shade(bg, 0.08));
  rim.addColorStop(1, shade(bg, -0.2));
  f.strokeStyle = rim;
  f.lineWidth = 7;
  f.beginPath();
  f.arc(cx, cy, r + 3.5, 0, Math.PI * 2);
  f.stroke();
  f.fillStyle = shade(bg, 0.1);
  f.beginPath();
  f.arc(cx, cy, r, 0, Math.PI * 2);
  f.fill();
  f.save();
  f.beginPath();
  f.arc(cx, cy, r, 0, Math.PI * 2);
  f.clip();
  if (avatar) {
    const s = Math.max((2 * r) / avatar.width, (2 * r) / avatar.height);
    f.drawImage(avatar, cx - (avatar.width * s) / 2, cy - (avatar.height * s) / 2, avatar.width * s, avatar.height * s);
    const pc = portrait.getContext("2d")!;
    pc.save();
    pc.beginPath();
    pc.arc(cx, cy, r, 0, Math.PI * 2);
    pc.clip();
    pc.drawImage(avatar, cx - (avatar.width * s) / 2, cy - (avatar.height * s) / 2, avatar.width * s, avatar.height * s);
    pc.globalCompositeOperation = "source-in";
    pc.fillStyle = "#fff";
    pc.fillRect(0, 0, FACE_W, FACE_H);
    pc.restore();
  } else {
    const pc = portrait.getContext("2d")!;
    pc.fillStyle = "#fff";
    pc.beginPath();
    pc.arc(cx, cy, r, 0, Math.PI * 2);
    pc.fill();
    f.fillStyle = shade(bg, 0.18);
    f.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    f.fillStyle = fg;
    f.font = `600 76px ui-sans-serif, system-ui, sans-serif`;
    f.textAlign = "center";
    f.textBaseline = "middle";
    f.fillText((card.displayName.replace(/^@/, "")[0] ?? "R").toUpperCase(), cx, cy + 6);
    f.textBaseline = "alphabetic";
  }
  f.restore();
  if (!opts.sdfText) {
    f.textAlign = "center";
    f.fillStyle = fg;
    fitText(f, card.displayName, FACE_W - 96, 44, 700);
    f.fillText(card.displayName, cx, FRONT_TEXT_Y.name);
    f.globalAlpha = 0.75;
    fitText(f, `@${card.handle}`, FACE_W - 96, 28, 500);
    f.fillText(`@${card.handle}`, cx, FRONT_TEXT_Y.handle);
    f.globalAlpha = 0.6;
    const sub = card.regionDisplay || card.subheader;
    fitText(f, sub, FACE_W - 96, 20, 400);
    f.fillText(sub, cx, FRONT_TEXT_Y.sub);
  }
  f.textAlign = "center";
  f.globalAlpha = 0.45;
  const frontValue = opts.frontQr ?? card.qrValue;
  f.globalAlpha = 0.6;
  f.font = `600 20px ui-monospace, SFMono-Regular, monospace`;
  f.fillText(frontValue.replace(/^https?:\/\//, ""), cx, FRONT_QR.y + FRONT_QR.size + 44);
  f.globalAlpha = 1;
  // Front: big public QR (rout.be/<handle>/<6 digits, new every 10 min>). Anyone may scan it:
  // phones open the profile, partners (pool, transit) check the digits are fresh.
  // Error correction H (30 %), so the centred ROUT seal (< 8 % of the area) never breaks scanning.
  const fq = drawQr(f, frontValue, FRONT_QR.x, FRONT_QR.y, FRONT_QR.size, "H", FRONT_QR.quiet, 12);
  const fqc = { x: fq.x + fq.w / 2, y: fq.y + fq.w / 2 };
  f.fillStyle = "#ffffff";
  f.beginPath();
  f.arc(fqc.x, fqc.y, fq.w * 0.1, 0, Math.PI * 2);
  f.fill();
  f.fillStyle = "#111111";
  drawEmblem(f, fqc.x, fqc.y, fq.w * 0.07);

  // Emblem bottom-right of the portrait, printed faintly; the foil does the rest.
  const ex = FACE_W - 84;
  const ey = FACE_H - 84;
  f.globalAlpha = 0.35;
  f.fillStyle = fg;
  drawEmblem(f, ex, ey, 34);
  f.globalAlpha = 1;

  // Mask: R foil, G latent watermark, B emboss.
  const m = mask.getContext("2d")!;
  m.fillStyle = "#000";
  m.fillRect(0, 0, FACE_W, FACE_H);
  m.globalCompositeOperation = "lighter";
  m.fillStyle = "#ff0000";
  m.strokeStyle = "#ff0000";
  drawEmblem(m, ex, ey, 34);
  m.lineWidth = 16;
  m.beginPath();
  m.arc(cx, cy, r + 12, 0, Math.PI * 2);
  m.stroke();
  m.lineWidth = 10;
  m.strokeRect(14, 14, FACE_W - 28, FACE_H - 28);
  m.font = `700 34px ui-sans-serif, system-ui, sans-serif`;
  m.textAlign = "left";
  m.fillText("ROUT", 48, 78);
  m.save();
  m.translate(FACE_W / 2, FACE_H * 0.3);
  m.rotate(-Math.PI / 5);
  m.fillStyle = "#00ff00";
  m.textAlign = "center";
  m.font = `800 92px ui-sans-serif, system-ui, sans-serif`;
  m.fillText("SECURE", 0, -30);
  m.font = `700 46px ui-monospace, SFMono-Regular, monospace`;
  m.fillText(card.sovereignId, 0, 40);
  m.restore();
  m.fillStyle = "#0000ff";
  m.font = `700 34px ui-sans-serif, system-ui, sans-serif`;
  m.fillText("ROUT", 48, 78);
  drawEmblem(m, ex, ey, 34);
  m.globalCompositeOperation = "source-over";

  // Back: deep graphite with a white QR panel (scans like paper), NFC mark,
  // live-code slot (drawn in 3D) and an ICAO-style machine-readable zone.
  const b = back.getContext("2d")!;
  const bgB = b.createLinearGradient(0, 0, 0, FACE_H);
  bgB.addColorStop(0, "#17171b");
  bgB.addColorStop(1, "#0b0b0d");
  b.fillStyle = bgB;
  b.fillRect(0, 0, FACE_W, FACE_H);
  b.fillStyle = "#f4f4f5";
  b.font = `700 30px ui-sans-serif, system-ui, sans-serif`;
  b.fillText("ROUT", 48, 76);
  b.strokeStyle = "#f4f4f5";
  b.lineWidth = 4;
  for (let i = 0; i < 3; i++) {
    b.beginPath();
    b.arc(FACE_W - 76, 66, 10 + i * 10, -Math.PI / 4, Math.PI / 4);
    b.stroke();
  }
  const qrSize = BACK_QR.size;
  const qy = BACK_QR.y;
  // Back: secure, rotating QR for the owner (expires with the 30 s window);
  // everyone else sees the public QR. Slim 2-module quiet zone, no extra frame.
  const secure = opts.secureQr ?? null;
  // Never the profile link: without a live owner token the slot stays empty.
  const bq = secure
    ? drawQr(b, secure, BACK_QR.x, qy, qrSize, "M", BACK_QR.quiet, 8)
    : (() => {
        b.fillStyle = "rgba(255,255,255,0.06)";
        b.beginPath();
        b.roundRect(BACK_QR.x, qy, qrSize, qrSize, 18);
        b.fill();
        b.fillStyle = "rgba(255,255,255,0.45)";
        b.textAlign = "center";
        b.font = `600 20px ui-monospace, SFMono-Regular, monospace`;
        b.fillText("BETAALCODE", BACK_QR.x + qrSize / 2, qy + qrSize / 2 - 6);
        b.fillText("ALLEEN EIGENAAR", BACK_QR.x + qrSize / 2, qy + qrSize / 2 + 22);
        return { x: BACK_QR.x, y: qy, w: qrSize };
      })();
  b.textAlign = "center";
  b.fillStyle = "#e4e4e7";
  const caption = secure ? "BETALEN · TOEGANG · 60 S · EENMALIG" : "BEVEILIGDE BETAALCODE";
  fitText(b, caption, FACE_W - 96, 26, 600);
  b.fillText(caption, FACE_W / 2, qy + qrSize + 56);
  // Live-code slot frame; the code itself is SDF text in the 3D card.
  b.strokeStyle = "rgba(255,255,255,0.18)";
  b.lineWidth = 2;
  b.beginPath();
  b.roundRect(48, qy + qrSize + 80, FACE_W - 96, 64, 14);
  b.stroke();
  b.fillStyle = "rgba(255,255,255,0.45)";
  b.font = `600 15px ui-monospace, SFMono-Regular, monospace`;
  b.fillText("LIVE · PROOF OF NOW", FACE_W / 2, qy + qrSize + 100);
  // Contactless label; the chip and antenna are drawn by the 3D card's security layer.
  const nfcY = qy + qrSize + 196;
  b.textAlign = "left";
  b.fillStyle = "#e4e4e7";
  b.font = `700 22px ui-sans-serif, system-ui, sans-serif`;
  b.fillText("NFC · CONTACTLESS", 48, nfcY);
  b.fillStyle = "rgba(255,255,255,0.5)";
  b.font = `500 16px ui-monospace, SFMono-Regular, monospace`;
  b.fillText("BETALEN · TOEGANG · SLEUTEL", 48, nfcY + 28);
  // MRZ strip
  const mrzTop = FACE_H - 150;
  b.fillStyle = "#e9e7e1";
  b.fillRect(0, mrzTop, FACE_W, 150);
  b.fillStyle = "#18181b";
  b.font = (await loadOcrB()) ? `400 27px "ROUT OCR-B", monospace` : `600 26px ui-monospace, SFMono-Regular, Menlo, monospace`;
  b.textAlign = "left";
  const lines = generateMRZ_TD1({ sovereignId: card.sovereignId, handle: card.handle, space: card.space, holderHash: card.serial.replace(/[^A-Za-z0-9]/g, "").slice(-6) });
  const cw = (FACE_W - 64) / 30;
  lines.forEach((line, row) => {
    for (let c = 0; c < line.length; c++) b.fillText(line.charAt(c), 32 + c * cw, mrzTop + 42 + row * 38);
  });
  return { front, back, mask, portrait, qrFront: fq, qrBack: bq };
}

export function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
