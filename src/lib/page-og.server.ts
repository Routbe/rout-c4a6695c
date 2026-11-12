import qrcode from "qrcode-generator";
import { BRAND, bunny, bunnyWithRings } from "@/lib/brand/logo";
import { PAGE_CARDS, type PageKey } from "@/lib/page-cards";
import type { Locale } from "@/lib/i18n";
import { TOPIC_CARD_ACCENT, TOPIC_SLUGS, type TopicSlug } from "@/lib/discover/topics";

/**
 * Deel-kaarten per pagina, volledig in code getekend (1200x630): echte
 * typografie, het officiële konijn en echte QR-codes. Eén vaste kaart per
 * pagina per taal — geen rotatie, zodat crawler-caches altijd kloppen.
 */
const W = 1200;
const H = 630;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Breekt tekst op woorden in regels van max `max` tekens. */
function wrap(text: string, max: number, lines = 3) {
  const out: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/)) {
    if ((cur + " " + word).trim().length > max && cur) {
      out.push(cur);
      cur = word;
    } else cur = (cur + " " + word).trim();
  }
  if (cur) out.push(cur);
  if (out.length > lines) {
    out.length = lines;
    out[lines - 1] = out[lines - 1].replace(/\s*\S*$/, "") + "…";
  }
  return out;
}

function textBlock(lines: string[], x: number, y: number, size: number, color: string, weight = 600, lh = 1.12, anchor = "start") {
  return lines
    .map((l, i) => `<text x="${x}" y="${y + i * size * lh}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}" letter-spacing="${weight >= 600 ? -size * 0.025 : 0}">${esc(l)}</text>`)
    .join("");
}

function headline(t: string) {
  return t.split(/\s[—|]\s/)[0].replace(/\s*\|\s*ROUT$/, "");
}
function tagline(t: string) {
  const parts = t.split(/\s—\s/);
  return parts[1] ?? "";
}

function footer(color: string, muted: string, label = "rout.be") {
  return `${bunny(72, 548, 30, color)}<text x="112" y="574" font-size="24" font-weight="600" fill="${color}" letter-spacing="-0.5">ROUT</text><text x="${W - 72}" y="574" font-size="22" fill="${muted}" text-anchor="end">${esc(label)}</text>`;
}

function qrPath(data: string, x: number, y: number, size: number) {
  const qr = qrcode(0, "M");
  qr.addData(data);
  qr.make();
  const n = qr.getModuleCount();
  const m = size / n;
  let d = "";
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${(x + c * m).toFixed(2)} ${(y + r * m).toFixed(2)}h${m.toFixed(2)}v${m.toFixed(2)}h-${m.toFixed(2)}z`;
  return d;
}

type Ctx = { title: string; desc: string; path: string };

const TEMPLATES: Record<PageKey, (c: Ctx) => string> = {
  home: ({ title, desc }) => {
    const gold = "#C9A84C";
    // Whole platform, not only QR: profile hub, ROUT card and QR side by side.
    const px = 690, py = 70;
    const profile = `<g transform="rotate(-5 ${px + 130} ${py + 230})"><rect x="${px}" y="${py}" width="260" height="440" rx="34" fill="#F7F3EA"/><circle cx="${px + 130}" cy="${py + 78}" r="42" fill="${gold}"/>${bunny(px + 108, py + 54, 44, "#0E0D0C")}<rect x="${px + 70}" y="${py + 140}" width="120" height="14" rx="7" fill="#0E0D0C"/><rect x="${px + 90}" y="${py + 164}" width="80" height="10" rx="5" fill="#A8A196"/>${[0, 1, 2, 3].map((i) => `<rect x="${px + 26}" y="${py + 200 + i * 54}" width="208" height="40" rx="20" fill="${i === 0 ? "#0E0D0C" : "#E9E3D6"}"/>`).join("")}</g>`;
    const cx = 880, cy = 330;
    const card = `<g transform="rotate(7 ${cx + 135} ${cy + 85})"><rect x="${cx}" y="${cy}" width="270" height="170" rx="18" fill="#1B1915" stroke="${gold}" stroke-opacity=".6"/><rect x="${cx + 22}" y="${cy + 26}" width="42" height="32" rx="6" fill="${gold}" fill-opacity=".8"/><text x="${cx + 22}" y="${cy + 140}" font-size="18" font-weight="600" fill="#F7F3EA" letter-spacing="3">ROUT CARD</text>${bunny(cx + 222, cy + 22, 28, "#F7F3EA")}</g>`;
    const qx = 980, qy = 96, qs = 140;
    const qr = `<rect x="${qx - 14}" y="${qy - 14}" width="${qs + 28}" height="${qs + 28}" rx="20" fill="#F7F3EA"/><path d="${qrPath("https://rout.be", qx, qy, qs)}" fill="#0E0D0C"/>`;
    return `<rect width="${W}" height="${H}" fill="#0E0D0C"/>
<radialGradient id="g" cx="78%" cy="45%" r="55%"><stop offset="0" stop-color="${gold}" stop-opacity=".22"/><stop offset="1" stop-color="${gold}" stop-opacity="0"/></radialGradient><rect width="${W}" height="${H}" fill="url(#g)"/>
${profile}${qr}${card}
<text x="72" y="118" font-size="20" font-weight="600" fill="${gold}" letter-spacing="4">PROFIEL · QR · WALLET · ID</text>
${textBlock(wrap(tagline(title) || headline(title), 18, 3), 72, 210, 60, "#F7F3EA")}
${textBlock(wrap(desc, 40, 4), 72, 400, 22, "#A8A196", 400, 1.4)}
${footer("#F7F3EA", "#7A746B")}`;
  },
  about: ({ title, desc }) => `<rect width="${W}" height="${H}" fill="#F4EFE3"/>
<line x1="72" y1="96" x2="${W - 72}" y2="96" stroke="#131211" stroke-width="2"/>
<text x="72" y="80" font-size="18" font-weight="600" fill="#131211" letter-spacing="4">MANIFEST</text><text x="${W - 72}" y="80" font-size="18" fill="#6B6458" text-anchor="end" letter-spacing="4">EST. EUROPE</text>
${textBlock(wrap(tagline(title) || headline(title), 16, 3), 72, 210, 92, "#131211", 600, 1.0)}
${textBlock(wrap(desc, 44, 3), 72, 440, 22, "#5C564B", 400, 1.4)}
${bunnyWithRings(990, 340, 130, BRAND.ink, "#FFFFFF")}
${footer("#131211", "#6B6458")}`,
  explore: ({ title, desc }) => {
    const cards = [
      { x: 700, y: 70, r: -6, c: "#41DB97", bg: "#0F2A1F" },
      { x: 860, y: 150, r: 5, c: "#F2725A", bg: "#2A1410" },
      { x: 690, y: 320, r: 4, c: "#7026E1", bg: "#1B1030" },
      { x: 880, y: 360, r: -4, c: "#C9A84C", bg: "#26200F" },
    ];
    const card = (k: (typeof cards)[number]) =>
      `<g transform="rotate(${k.r} ${k.x + 110} ${k.y + 80})"><rect x="${k.x}" y="${k.y}" width="220" height="170" rx="22" fill="${k.bg}" stroke="${k.c}" stroke-opacity=".5"/><circle cx="${k.x + 44}" cy="${k.y + 46}" r="22" fill="${k.c}"/><rect x="${k.x + 78}" y="${k.y + 34}" width="110" height="12" rx="6" fill="#EDEDED"/><rect x="${k.x + 78}" y="${k.y + 54}" width="70" height="9" rx="4.5" fill="#8A8A8A"/><rect x="${k.x + 22}" y="${k.y + 94}" width="176" height="26" rx="13" fill="${k.c}" fill-opacity=".9"/><rect x="${k.x + 22}" y="${k.y + 128}" width="176" height="26" rx="13" fill="#FFFFFF" fill-opacity=".1"/></g>`;
    return `<rect width="${W}" height="${H}" fill="#0B1411"/>${cards.map(card).join("")}
<text x="72" y="118" font-size="20" font-weight="600" fill="${BRAND.mint}" letter-spacing="4">EXPLORE</text>
${textBlock(wrap(headline(title), 16, 3), 72, 210, 62, "#F2F7F4")}
${textBlock(wrap(desc, 38, 4), 72, 410, 24, "#8FA79B", 400, 1.4)}
${footer("#F2F7F4", "#5E7468", "rout.be/explore")}`;
  },
  privacy: ({ title, desc }) => {
    const shield = (s: number, o: number) => {
      const cx = 940, cy = 300;
      return `<path d="M${cx} ${cy - 170 * s} L${cx + 140 * s} ${cy - 115 * s} V${cy + 10 * s} C${cx + 140 * s} ${cy + 110 * s} ${cx + 60 * s} ${cy + 170 * s} ${cx} ${cy + 200 * s} C${cx - 60 * s} ${cy + 170 * s} ${cx - 140 * s} ${cy + 110 * s} ${cx - 140 * s} ${cy + 10 * s} V${cy - 115 * s} Z" fill="none" stroke="#B48CFF" stroke-opacity="${o}" stroke-width="2"/>`;
    };
    return `<rect width="${W}" height="${H}" fill="#140A26"/>${[1.5, 1.3, 1.1, 0.9, 0.7].map((s, i) => shield(s, 0.15 + i * 0.17)).join("")}
<text x="940" y="335" font-size="120" font-weight="600" fill="#FFFFFF" text-anchor="middle" letter-spacing="-4">0</text><text x="940" y="378" font-size="20" font-weight="600" fill="#B48CFF" text-anchor="middle" letter-spacing="4">TRACKERS</text>
<text x="72" y="118" font-size="20" font-weight="600" fill="#B48CFF" letter-spacing="4">PRIVACY</text>
${textBlock(wrap(headline(title), 18, 3), 72, 210, 60, "#FFFFFF")}
${textBlock(wrap(desc, 38, 3), 72, 410, 24, "#A79BC2", 400, 1.4)}
${footer("#FFFFFF", "#7C6F99", "rout.be/privacy")}`;
  },
  press: ({ title, desc }) => {
    let grid = "";
    for (let x = 640; x <= W; x += 40) grid += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#FFFFFF" stroke-opacity=".06"/>`;
    for (let y = 0; y <= H; y += 40) grid += `<line x1="640" y1="${y}" x2="${W}" y2="${y}" stroke="#FFFFFF" stroke-opacity=".06"/>`;
    return `<rect width="${W}" height="${H}" fill="${BRAND.ink}"/>${grid}
<rect x="780" y="120" width="280" height="343" fill="none" stroke="${BRAND.mint}" stroke-dasharray="6 6" stroke-opacity=".7"/>${bunny(820, 152, 200, "#FFFFFF")}
<text x="920" y="500" font-size="16" fill="#8A857C" text-anchor="middle" letter-spacing="3">CLEAR SPACE = 1 EAR</text>
<text x="72" y="118" font-size="20" font-weight="600" fill="${BRAND.mint}" letter-spacing="4">PRESS KIT</text>
${textBlock(wrap(headline(title), 16, 3), 72, 210, 62, "#FFFFFF")}
${textBlock(wrap(desc, 34, 3), 72, 410, 24, "#9A948A", 400, 1.4)}
${[BRAND.ink, "#FFFFFF", BRAND.purple, BRAND.mint].map((c, i) => `<rect x="${72 + i * 52}" y="500" width="40" height="20" rx="4" fill="${c}" stroke="#3A3733"/>`).join("")}
${bunny(1110, 560, 20, "#FFFFFF")}`;
  },
  contact: ({ title, desc }) => `<rect width="${W}" height="${H}" fill="#F2725A"/>
<path d="M700 150 h360 a40 40 0 0 1 40 40 v200 a40 40 0 0 1 -40 40 h-250 l-70 60 v-60 h-40 a40 40 0 0 1 -40 -40 v-200 a40 40 0 0 1 40 -40z" fill="#FFF4EF"/>
${bunny(840, 205, 120, "#2A1410")}
<text x="72" y="118" font-size="20" font-weight="600" fill="#2A1410" letter-spacing="4">CONTACT</text>
${textBlock(wrap(headline(title), 16, 3), 72, 210, 64, "#2A1410")}
${textBlock(wrap(desc, 38, 4), 72, 410, 24, "#5A2A20", 400, 1.4)}
${footer("#2A1410", "#6E3A2E", "rout.be/contact")}`,
  terms: ({ title, desc }) => {
    let lines = "";
    for (let i = 0; i < 9; i++) lines += `<rect x="740" y="${150 + i * 34}" width="${i % 3 === 2 ? 220 : 340}" height="10" rx="5" fill="#C9D4E3" fill-opacity="${i === 0 ? 1 : 0.45}"/>`;
    return `<rect width="${W}" height="${H}" fill="#1B2636"/><rect x="700" y="100" width="420" height="430" rx="20" fill="#24324A" stroke="#4A6382"/>${lines}
<text x="740" y="490" font-size="18" font-weight="600" fill="#9FB3CF" letter-spacing="3">§ 1 — § 24</text>
<text x="72" y="118" font-size="20" font-weight="600" fill="#9FB3CF" letter-spacing="4">TERMS</text>
${textBlock(wrap(headline(title), 16, 3), 72, 210, 62, "#FFFFFF")}
${textBlock(wrap(desc, 38, 4), 72, 400, 24, "#9FB3CF", 400, 1.4)}
${footer("#FFFFFF", "#6F849F", "rout.be/terms")}`;
  },
  sovereignty: ({ title, desc }) => {
    // Twaalf sterren in een cirkel, zoals de Europese vlag.
    let stars = "";
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      stars += `<circle cx="${920 + Math.cos(a) * 170}" cy="${310 + Math.sin(a) * 170}" r="9" fill="#F5C542"/>`;
    }
    return `<rect width="${W}" height="${H}" fill="#0E1A33"/>${stars}${bunny(870, 248, 100, "#FFFFFF")}
<text x="72" y="118" font-size="20" font-weight="600" fill="#F5C542" letter-spacing="4">SOVEREIGNTY</text>
${textBlock(wrap(headline(title), 16, 3), 72, 210, 62, "#FFFFFF")}
${textBlock(wrap(desc, 38, 4), 72, 400, 24, "#9AA8C7", 400, 1.4)}
${footer("#FFFFFF", "#6A7899", "rout.be/sovereignty")}`;
  },
};

export function isPageKey(v: string): v is PageKey {
  return v in PAGE_CARDS;
}

export function renderPageCardSvg(key: PageKey, locale: Locale) {
  const card = PAGE_CARDS[key];
  const t = card.text[locale] ?? card.text.en;
  const body = TEMPLATES[key]({ title: t.title, desc: t.description, path: card.path });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter">${body}</svg>`;
}

/** Chip label: up to two lines at 18px, three smaller lines when the label is long. */
const chipLines = (c: string) => (wrap(c, 13, 9).length <= 2 ? wrap(c, 13, 2) : wrap(c, 16, 3));

/** Font size so the longest chip line fits the 136px text column (Inter ≈ 0.56em per character). */
const chipSize = (c: string) => Math.min(chipLines(c).length > 2 ? 15 : 18, Math.floor(136 / (Math.max(...chipLines(c).map((l) => l.length)) * 0.56)));

/** Product-page card: own accent per product line, brand chip, headline, lead and the ROUT footer. */
export function renderTopicCardSvg(slug: TopicSlug, locale: Locale, copy: { brand: string; title: string; lead: string; chips: readonly string[] }) {
  const [a, b] = TOPIC_CARD_ACCENT[slug];
  const num = String(TOPIC_SLUGS.indexOf(slug) + 1).padStart(2, "0");
  const chipW = Math.min(520, 120 + copy.brand.length * 14);
  const chips = copy.chips.slice(0, 4).map((c, i) => {
    const x = 740 + (i % 2) * 210, y = 170 + Math.floor(i / 2) * 150 + (i % 2) * 40;
    return `<g transform="rotate(${i % 2 ? 4 : -4} ${x + 100} ${y + 40})"><rect x="${x}" y="${y}" width="200" height="84" rx="22" fill="#151413" stroke="${i % 2 ? b : a}" stroke-opacity=".55"/><circle cx="${x + 30}" cy="${y + 42}" r="9" fill="${i % 2 ? b : a}"/>${textBlock(chipLines(c), x + 50, y + [48, 38, 28][chipLines(c).length - 1]!, chipSize(c), "#EDEAE3", 600, 1.2)}</g>`;
  }).join("");
  // Headline never ends in an ellipsis: step the size down until it fits in three lines.
  const head = [{ size: 58, max: 20 }, { size: 50, max: 23 }, { size: 44, max: 27 }]
    .map((o) => ({ size: o.size, lines: wrap(copy.title, o.max, 9) }))
    .find((o) => o.lines.length <= (o.size === 58 ? 2 : 3)) ?? { size: 40, lines: wrap(copy.title, 30, 3) };
  const barY = Math.round(200 + (head.lines.length - 1) * head.size * 1.12 + 40);
  const leadLines = Math.max(1, Math.min(3, Math.floor((520 - (barY + 56)) / 31) + 1));
  const body = `<rect width="${W}" height="${H}" fill="#0E0D0C"/>
<radialGradient id="ga" cx="78%" cy="40%" r="50%"><stop offset="0" stop-color="${a}" stop-opacity=".30"/><stop offset="1" stop-color="${a}" stop-opacity="0"/></radialGradient><rect width="${W}" height="${H}" fill="url(#ga)"/>
<radialGradient id="gb" cx="15%" cy="95%" r="40%"><stop offset="0" stop-color="${b}" stop-opacity=".16"/><stop offset="1" stop-color="${b}" stop-opacity="0"/></radialGradient><rect width="${W}" height="${H}" fill="url(#gb)"/>
${chips}
<rect x="72" y="72" width="${chipW}" height="44" rx="22" fill="${a}" fill-opacity=".1" stroke="${a}" stroke-opacity=".45"/><rect x="78" y="78" width="48" height="32" rx="16" fill="${a}"/><text x="102" y="100" font-size="15" font-weight="700" fill="#14130F" text-anchor="middle">${num}</text><text x="140" y="101" font-size="19" font-weight="600" fill="#F7F3EA">${esc(copy.brand)}</text>
${textBlock(head.lines, 72, 200, head.size, "#F7F3EA")}
<rect x="72" y="${barY}" width="72" height="4" rx="2" fill="${a}"/>
${textBlock(wrap(copy.lead, 50, leadLines), 72, barY + 56, 22, "#A8A196", 400, 1.4)}
${footer("#F7F3EA", "#7A746B", `rout.be/discover/${slug}`)}`;
  void locale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter">${body}</svg>`;
}

/** Neutral card fields shared by the wide centre-safe and the square layout. */
export type CardFields = { label: string; title: string; desc: string; accent: string; url: string };

function sizeTitle(title: string, opts: { size: number; max: number }[], maxLines: number) {
  return opts.map((o) => ({ size: o.size, lines: wrap(title, o.max, 9) })).find((o) => o.lines.length <= maxLines)
    ?? { size: opts[opts.length - 1]!.size, lines: wrap(title, opts[opts.length - 1]!.max, maxLines) };
}

/**
 * 1200x630, everything important inside the centre 630px so a square crop
 * (Snapchat, iMessage compact, WhatsApp thumbnail) still shows the whole message.
 */
export function renderPathCardSvg(c: CardFields) {
  const cx = W / 2;
  const head = sizeTitle(c.title, [{ size: 54, max: 20 }, { size: 46, max: 24 }, { size: 40, max: 27 }], 3);
  // Short titles sit lower so the card never looks top-heavy.
  const titleY = 250 + (3 - head.lines.length) * 34;
  const after = titleY + (head.lines.length - 1) * head.size * 1.12;
  const labelW = Math.min(520, 70 + c.label.length * 13);
  let dots = "";
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? W - 90 : 90, y = 90 + Math.floor(i / 2) * 56;
    dots += `<circle cx="${side + (i % 3) * 14 - 14}" cy="${y}" r="${3 + (i % 3)}" fill="${c.accent}" fill-opacity="${0.15 + (i % 4) * 0.08}"/>`;
  }
  const body = `<rect width="${W}" height="${H}" fill="#0E0D0C"/>
<radialGradient id="pa" cx="50%" cy="0%" r="60%"><stop offset="0" stop-color="${c.accent}" stop-opacity=".30"/><stop offset="1" stop-color="${c.accent}" stop-opacity="0"/></radialGradient><rect width="${W}" height="${H}" fill="url(#pa)"/>
<rect x="0" y="0" width="${W}" height="8" fill="${c.accent}"/>${dots}
<rect x="${cx - labelW / 2}" y="${titleY - 138}" width="${labelW}" height="44" rx="22" fill="${c.accent}" fill-opacity=".12" stroke="${c.accent}" stroke-opacity=".5"/>
<text x="${cx}" y="${titleY - 109}" font-size="18" font-weight="700" fill="${c.accent}" text-anchor="middle" letter-spacing="3">${esc(c.label.toUpperCase())}</text>
${textBlock(head.lines, cx, titleY, head.size, "#F7F3EA", 600, 1.12, "middle")}
<rect x="${cx - 36}" y="${after + 34}" width="72" height="4" rx="2" fill="${c.accent}"/>
${textBlock(wrap(c.desc, 44, after > 300 ? 2 : 3), cx, after + 84, 22, "#A8A196", 400, 1.4, "middle")}
${bunny(cx - 70, 548, 30, "#F7F3EA")}<text x="${cx - 30}" y="574" font-size="24" font-weight="600" fill="#F7F3EA" letter-spacing="-0.5">ROUT</text><text x="${cx + 40}" y="574" font-size="20" fill="#7A746B">${esc(c.url.length > 22 ? "rout.be" : c.url)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter">${body}</svg>`;
}

/** 1080x1080 layout for square previews (Snapchat chat cards). */
export function renderSquareCardSvg(c: CardFields) {
  const S = 1080, cx = S / 2;
  const head = sizeTitle(c.title, [{ size: 80, max: 16 }, { size: 68, max: 19 }, { size: 58, max: 22 }], 4);
  const titleY = 420;
  const after = titleY + (head.lines.length - 1) * head.size * 1.12;
  const labelW = Math.min(800, 100 + c.label.length * 19);
  const body = `<rect width="${S}" height="${S}" fill="#0E0D0C"/>
<radialGradient id="sa" cx="50%" cy="10%" r="70%"><stop offset="0" stop-color="${c.accent}" stop-opacity=".34"/><stop offset="1" stop-color="${c.accent}" stop-opacity="0"/></radialGradient><rect width="${S}" height="${S}" fill="url(#sa)"/>
<rect x="40" y="40" width="${S - 80}" height="${S - 80}" rx="56" fill="none" stroke="${c.accent}" stroke-opacity=".45" stroke-width="3"/>
${bunny(cx - 50, 120, 100, c.accent)}
<rect x="${cx - labelW / 2}" y="262" width="${labelW}" height="60" rx="30" fill="${c.accent}" fill-opacity=".12" stroke="${c.accent}" stroke-opacity=".5"/>
<text x="${cx}" y="302" font-size="26" font-weight="700" fill="${c.accent}" text-anchor="middle" letter-spacing="4">${esc(c.label.toUpperCase())}</text>
${textBlock(head.lines, cx, titleY, head.size, "#F7F3EA", 600, 1.12, "middle")}
<rect x="${cx - 50}" y="${after + 46}" width="100" height="6" rx="3" fill="${c.accent}"/>
${textBlock(wrap(c.desc, 34, after > 600 ? 2 : 4), cx, after + 120, 34, "#A8A196", 400, 1.4, "middle")}
<text x="${cx}" y="${S - 96}" font-size="34" font-weight="600" fill="#F7F3EA" text-anchor="middle" letter-spacing="-0.5">ROUT · <tspan fill="#7A746B" font-weight="400">${esc(c.url.length > 30 ? "rout.be" : c.url)}</tspan></text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" font-family="Inter">${body}</svg>`;
}

/** Fields for the square variant of an existing page card. */
export function pageCardFields(key: PageKey, locale: Locale): CardFields {
  const card = PAGE_CARDS[key];
  const t = card.text[locale] ?? card.text.en;
  const title = t.title.replace(/^ROUT\s+—\s+/, "").replace(/\s*\|\s*ROUT$/, "");
  const accent = /^#(?:[0-9a-f]{2}){3}$/i.test(card.themeColor) && card.themeColor !== "#F4EFE3" ? card.themeColor : "#C9A84C";
  return { label: key === "home" ? "ROUT" : key, title, desc: t.description, accent, url: `rout.be${card.path === "/" ? "" : card.path}` };
}
