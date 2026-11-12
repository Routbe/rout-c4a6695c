/** Draws a compact digital business card (PNG) in the browser and exports PNG/PDF. */
export type CardInput = { name: string; handle: string; bio: string; url: string; avatarUrl?: string | null; qrDataUrl: string };

const W = 1050;
const H = 600;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    } else line = test;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) lines[maxLines - 1] = `${lines[maxLines - 1]!.replace(/.{0,2}$/, "")}…`;
  return lines;
}

export async function renderCard(c: CardInput): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0b0b0c");
  bg.addColorStop(1, "#1c1c20");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // QR on a white tile, right side.
  const qr = await loadImage(c.qrDataUrl);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(W - 340, 130, 280, 280, 24);
  ctx.fill();
  if (qr) ctx.drawImage(qr, W - 320, 150, 240, 240);

  // Avatar
  let x = 64;
  const avatar = c.avatarUrl ? await loadImage(c.avatarUrl) : null;
  if (avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(64 + 56, 120, 56, 0, Math.PI * 2);
    ctx.clip();
    try {
      ctx.drawImage(avatar, 64, 64, 112, 112);
    } catch {
      /* tainted image: skip */
    }
    ctx.restore();
  }
  x = 64;
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 52px system-ui, sans-serif";
  ctx.fillText(c.name.slice(0, 28), x, 250);
  ctx.fillStyle = "#a1a1aa";
  ctx.font = "500 28px ui-monospace, monospace";
  ctx.fillText(`@${c.handle}`, x, 294);
  ctx.fillStyle = "#d4d4d8";
  ctx.font = "400 26px system-ui, sans-serif";
  wrap(ctx, c.bio, W - 340 - 64 - 48, 3).forEach((l, i) => ctx.fillText(l, x, 350 + i * 36));
  ctx.fillStyle = "#71717a";
  ctx.font = "500 22px ui-monospace, monospace";
  ctx.fillText(c.url.replace(/^https?:\/\//, ""), x, H - 56);
  ctx.fillText("ROUT", W - 340, H - 56);
  return canvas;
}

function download(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function downloadCardPng(c: CardInput) {
  const canvas = await renderCard(c);
  download(canvas.toDataURL("image/png"), `${c.handle || "rout"}-visitekaartje.png`);
}

export async function downloadCardPdf(c: CardInput) {
  const canvas = await renderCard(c);
  const { jsPDF } = await import("jspdf");
  // Standard business card: 85 × 55 mm, landscape.
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [85, 55] });
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 85, 55 * (85 / 55) * (H / W));
  pdf.save(`${c.handle || "rout"}-visitekaartje.pdf`);
}
