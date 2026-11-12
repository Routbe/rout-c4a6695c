/**
 * Client-side 1080×1920 story card (Instagram / Snapchat / WhatsApp status)
 * drawn on a native canvas — no html2canvas, no server round trip. Colors come
 * from the --story-* design tokens; content stays inside the story safe zone
 * (top 250 px and bottom 340 px are covered by the apps' own UI).
 */

export const STORY_W = 1080;
export const STORY_H = 1920;
export const STORY_SAFE_TOP = 250;
export const STORY_SAFE_BOTTOM = 340;

export type StoryCardInput =
  | { kind: "prompt"; prompt: string; handle: string; displayName: string | null; avatarSrc: string | null; hint: string; sendMe: string; link: string }
  | { kind: "answer"; question: string; answer: string; label: string; handle: string; displayName: string | null; avatarSrc: string | null; hint: string; link: string };

function token(name: string, alpha = 1): string {
  const raw = typeof document === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const parts = raw.split(/\s+/);
  if (parts.length < 3) return alpha < 1 ? `rgba(0,0,0,${alpha})` : "#000";
  return `hsla(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Greedy word wrap; hard-breaks words longer than a line. */
export function wrapText(measure: (s: string) => number, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\n+/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (measure(next) <= maxWidth) { line = next; continue; }
      if (line) lines.push(line);
      if (measure(word) <= maxWidth) { line = word; continue; }
      let chunk = "";
      for (const ch of [...word]) {
        if (measure(chunk + ch) > maxWidth && chunk) { lines.push(chunk); chunk = ch; } else chunk += ch;
      }
      line = chunk;
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** Largest font size (step 4) whose wrapped text fits the line budget; ellipsis on overflow. */
function fitText(ctx: CanvasRenderingContext2D, text: string, family: string, weight: number, max: number, min: number, width: number, maxLines: number) {
  for (let size = max; size >= min; size -= 4) {
    ctx.font = `${weight} ${size}px ${family}`;
    const lines = wrapText((s) => ctx.measureText(s).width, text, width);
    if (lines.length <= maxLines) return { size, lines };
  }
  ctx.font = `${weight} ${min}px ${family}`;
  const lines = wrapText((s) => ctx.measureText(s).width, text, width).slice(0, maxLines);
  const last = lines[maxLines - 1];
  if (last) {
    let cut = last;
    while (cut && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
    lines[maxLines - 1] = `${cut.trimEnd()}…`;
  }
  return { size: min, lines };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function tintedLogo(color: string, size: number): Promise<HTMLCanvasElement | null> {
  const img = await loadImage("/logo.svg");
  if (!img) return null;
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const x = c.getContext("2d");
  if (!x) return null;
  x.drawImage(img, 0, 0, size, size);
  x.globalCompositeOperation = "source-in";
  x.fillStyle = color;
  x.fillRect(0, 0, size, size);
  return c;
}

function initials(name: string): string {
  return name.replace(/^@/, "").split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

async function drawAvatar(ctx: CanvasRenderingContext2D, src: string | null, name: string, cx: number, cy: number, r: number, family: string) {
  // Status ring (same green as the profile ring).
  const ring = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  ring.addColorStop(0, token("--story-ring"));
  ring.addColorStop(1, token("--story-ring-2"));
  ctx.beginPath(); ctx.arc(cx, cy, r + 14, 0, Math.PI * 2); ctx.fillStyle = ring; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, Math.PI * 2); ctx.fillStyle = token("--story-bg-to"); ctx.fill();
  const img = src ? await loadImage(src) : null;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  if (img) {
    const s = Math.max((2 * r) / img.naturalWidth, (2 * r) / img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  } else {
    ctx.fillStyle = token("--story-card");
    ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    ctx.fillStyle = token("--story-ink");
    ctx.font = `700 ${Math.round(r * 0.8)}px ${family}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(initials(name), cx, cy + 4);
  }
  ctx.restore();
}

function drawLines(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, lineHeight: number) {
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
}

async function paint(input: StoryCardInput, withAvatar: boolean): Promise<Blob> {
  if (typeof document !== "undefined" && document.fonts?.ready) await document.fonts.ready.catch(() => undefined);
  const canvas = document.createElement("canvas");
  canvas.width = STORY_W; canvas.height = STORY_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  const family = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  const display = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim() || family;

  // Background: deep gradient + soft glow + subtle grain.
  const bg = ctx.createLinearGradient(0, 0, STORY_W * 0.4, STORY_H);
  bg.addColorStop(0, token("--story-bg-from"));
  bg.addColorStop(1, token("--story-bg-to"));
  ctx.fillStyle = bg; ctx.fillRect(0, 0, STORY_W, STORY_H);
  const glow = ctx.createRadialGradient(STORY_W * 0.85, STORY_H * 0.18, 40, STORY_W * 0.85, STORY_H * 0.18, 900);
  glow.addColorStop(0, token("--story-glow", 0.35));
  glow.addColorStop(1, token("--story-glow", 0));
  ctx.fillStyle = glow; ctx.fillRect(0, 0, STORY_W, STORY_H);
  ctx.fillStyle = token("--story-card", 0.035);
  for (let i = 0; i < 1600; i++) ctx.fillRect((i * 733) % STORY_W, (i * 1291) % STORY_H, 2, 2);

  const name = input.displayName || `@${input.handle}`;
  const cardX = 90, cardW = STORY_W - 180, pad = 64;
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";

  let y = STORY_SAFE_TOP + (input.kind === "prompt" ? 40 : 0);
  const avatarR = input.kind === "prompt" ? 120 : 72;
  await drawAvatar(ctx, withAvatar ? input.avatarSrc : null, name, STORY_W / 2, y + avatarR, avatarR, family);
  y += avatarR * 2 + 76;
  ctx.fillStyle = token("--story-card");
  ctx.font = `600 44px ${family}`;
  ctx.fillText(name.length > 32 ? `${name.slice(0, 31)}…` : name, STORY_W / 2, y);
  y += 60;

  // Card: gradient header (prompt / question) + light body (link / answer).
  const headText = input.kind === "prompt" ? input.prompt : input.question;
  const head = fitText(ctx, headText, display, 400, input.kind === "prompt" ? 76 : 66, 44, cardW - pad * 2, input.kind === "prompt" ? 4 : 5);
  const labelH = input.kind === "answer" ? 56 : 0;
  const headH = pad * 2 + labelH + head.lines.length * head.size * 1.18;
  const bodyText = input.kind === "prompt" ? input.sendMe : input.answer;
  const body = fitText(ctx, bodyText, family, input.kind === "prompt" ? 500 : 600, input.kind === "prompt" ? 44 : 50, 34, cardW - pad * 2, input.kind === "prompt" ? 2 : 7);
  const hasBody = bodyText.trim().length > 0;
  const bodyH = hasBody ? pad * 2 + body.lines.length * body.size * 1.3 : 0;
  const cardH = headH + bodyH;
  // Reserve room below the card for the hint, the link and the bunny mark.
  const maxBottom = STORY_H - STORY_SAFE_BOTTOM - 76 - 250;
  const cardY = Math.min(y + 30, maxBottom - cardH);

  ctx.save();
  ctx.shadowColor = token("--story-bg-to", 0.6); ctx.shadowBlur = 60; ctx.shadowOffsetY = 24;
  roundRect(ctx, cardX, cardY, cardW, cardH, 56);
  ctx.fillStyle = token("--story-card"); ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, cardX, cardY, cardW, cardH, 56); ctx.clip();
  const hg = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + headH);
  hg.addColorStop(0, token("--story-ring"));
  hg.addColorStop(1, token("--story-ring-2"));
  ctx.fillStyle = hg; ctx.fillRect(cardX, cardY, cardW, headH);
  ctx.restore();

  let ty = cardY + pad;
  if (input.kind === "answer") {
    ctx.fillStyle = token("--story-card", 0.85);
    ctx.font = `700 30px ${family}`;
    ctx.fillText(input.label, STORY_W / 2, ty + 28);
    ty += labelH;
  }
  ctx.fillStyle = token("--story-card");
  ctx.font = `400 ${head.size}px ${display}`;
  drawLines(ctx, head.lines, STORY_W / 2, ty + head.size, head.size * 1.18);

  if (hasBody) {
    ctx.fillStyle = token("--story-ink", input.kind === "prompt" ? 0.55 : 1);
    ctx.font = `${input.kind === "prompt" ? 500 : 600} ${body.size}px ${family}`;
    drawLines(ctx, body.lines, STORY_W / 2, cardY + headH + pad + body.size, body.size * 1.3);
  }

  // Sticker hint + link, then the bunny, all above the bottom safe zone.
  let by = cardY + cardH + 110;
  ctx.fillStyle = token("--story-card");
  ctx.font = `400 64px ${display}`;
  ctx.fillText(input.hint, STORY_W / 2, by);
  by += 64;
  ctx.fillStyle = token("--story-card", 0.7);
  ctx.font = `500 34px ${family}`;
  ctx.fillText(input.link.replace(/^https?:\/\//, ""), STORY_W / 2, by);

  const logoSize = 76;
  const logo = await tintedLogo(token("--story-card"), logoSize * 2);
  const ly = STORY_H - STORY_SAFE_BOTTOM - logoSize;
  ctx.font = `400 44px ${display}`;
  const word = "ROUT";
  const ww = ctx.measureText(word).width;
  const total = logoSize + 18 + ww;
  const lx = (STORY_W - total) / 2;
  if (logo) ctx.drawImage(logo, lx, ly, logoSize, logoSize);
  ctx.textAlign = "left"; ctx.fillStyle = token("--story-card");
  ctx.fillText(word, lx + logoSize + 18, ly + logoSize / 2 + 14);

  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("export_failed"))), "image/png");
    } catch (e) {
      reject(e);
    }
  });
}

/** Renders the card; a tainted avatar falls back to initials instead of failing. */
export async function renderStoryCard(input: StoryCardInput): Promise<Blob> {
  try {
    return await paint(input, true);
  } catch {
    return paint(input, false);
  }
}
