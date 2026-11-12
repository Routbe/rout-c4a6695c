import { escapeXml, initials } from "@/lib/og-card";
import { OG_FORMATS, ogFormatQuery, type OgFormat } from "@/lib/og-formats";

/**
 * Share cards (1200×630) for a member's action links: anonymous message, donate,
 * tip and booking. NGL-style: one framed card in the middle (coloured header with
 * photo + invitation, white body), a tap pill under it and the link at the bottom.
 * Everything important sits in the centre 600 px, so Snapchat, WhatsApp and
 * Instagram crops (square or portrait) still show the whole invitation.
 */
export type ShareCardKind = "ask" | "donate" | "tip" | "booking";
export type ShareCardLang = "nl" | "en" | "fr" | "de";

type Copy = { title: string; body: string; cta: string };
const COPY: Record<ShareCardLang, Record<ShareCardKind, Copy>> = {
  nl: {
    ask: { title: "Stuur me een anoniem bericht!", body: "Typ hier je anonieme vraag…", cta: "Tik om me anoniem te sturen" },
    donate: { title: "Steun mijn werk", body: "Kies zelf een bedrag en betaal met je bank-app", cta: "Tik om me te steunen" },
    tip: { title: "Trakteer me op een fooi", body: "Een klein bedrag, rechtstreeks via je bank-app", cta: "Tik om een fooi te geven" },
    booking: { title: "Boek een afspraak met mij", body: "Kies een moment dat jou past", cta: "Tik om te boeken" },
  },
  en: {
    ask: { title: "Send me an anonymous message!", body: "Type your anonymous question…", cta: "Tap to send me one anonymously" },
    donate: { title: "Support my work", body: "Choose an amount and pay with your bank app", cta: "Tap to support me" },
    tip: { title: "Buy me a tip", body: "A small amount, straight from your bank app", cta: "Tap to tip me" },
    booking: { title: "Book a meeting with me", body: "Pick a time that suits you", cta: "Tap to book" },
  },
  fr: {
    ask: { title: "Envoie-moi un message anonyme !", body: "Écris ta question anonyme…", cta: "Touche pour m'écrire anonymement" },
    donate: { title: "Soutiens mon travail", body: "Choisis un montant et paie avec ton app bancaire", cta: "Touche pour me soutenir" },
    tip: { title: "Offre-moi un pourboire", body: "Un petit montant, directement depuis ton app bancaire", cta: "Touche pour donner un pourboire" },
    booking: { title: "Prends rendez-vous avec moi", body: "Choisis le moment qui te convient", cta: "Touche pour réserver" },
  },
  de: {
    ask: { title: "Schick mir eine anonyme Nachricht!", body: "Schreib hier deine anonyme Frage…", cta: "Tippen, um mir anonym zu schreiben" },
    donate: { title: "Unterstütze meine Arbeit", body: "Wähle einen Betrag und zahle mit deiner Bank-App", cta: "Tippen, um mich zu unterstützen" },
    tip: { title: "Spendier mir ein Trinkgeld", body: "Ein kleiner Betrag, direkt aus deiner Bank-App", cta: "Tippen für ein Trinkgeld" },
    booking: { title: "Buch einen Termin mit mir", body: "Wähle eine Zeit, die dir passt", cta: "Tippen zum Buchen" },
  },
};

/** Two vivid stops per kind: recognisable in a feed, white text always ≥ 4.5:1 on the darker stop. */
const PALETTE: Record<ShareCardKind, [string, string]> = {
  ask: ["#E1306C", "#F56040"],
  donate: ["#0F7B5F", "#1FA37A"],
  tip: ["#B4570B", "#E08A1E"],
  booking: ["#2348C7", "#4E7BF2"],
};

export function parseShareCardKind(v: string | null): ShareCardKind | null {
  return v === "ask" || v === "donate" || v === "tip" || v === "booking" ? v : null;
}
export function parseShareCardLang(v: string | null): ShareCardLang {
  return v === "en" || v === "fr" || v === "de" ? v : "nl";
}
export function shareCardCopy(kind: ShareCardKind, lang: ShareCardLang): Copy {
  return COPY[lang][kind];
}

/** Greedy word wrap for a fixed font size (Inter metrics ≈ 0.56 em per character). */
export function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = w.length > maxChars ? `${w.slice(0, maxChars - 1)}…` : w;
    }
    if (lines.length === maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    const last = lines[maxLines - 1]!;
    lines[maxLines - 1] = last.length >= maxChars ? `${last.slice(0, maxChars - 1)}…` : `${last}…`;
  }
  return lines;
}

/** One line when it fits, otherwise two lines of near-equal length (no lonely last word). */
export function balancedTitle(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(/\s+/).filter(Boolean);
  let best: string[] = wrapLines(text, maxChars, 2);
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
    if (a.length > maxChars || b.length > maxChars) continue;
    const d = Math.abs(a.length - b.length);
    if (d < bestDiff) { bestDiff = d; best = [a, b]; }
  }
  return best;
}

export function shareCardSvg(input: { kind: ShareCardKind; lang: ShareCardLang; handle: string; name: string; avatarUrl: string | null; urlLabel: string; format?: OgFormat }) {
  const { kind, handle, name, avatarUrl } = input;
  const copy = shareCardCopy(kind, input.lang);
  const [c1, c2] = PALETTE[kind];
  const X = 300, W = 600, Y = 46, HEAD = 250, BODY = 120, R = 40;
  const cx = 600;
  const ay = Y + 60;
  const avatar = avatarUrl
    ? `<clipPath id="av"><circle cx="${cx}" cy="${ay}" r="40"/></clipPath><circle cx="${cx}" cy="${ay}" r="44" fill="#ffffff"/><image href="${escapeXml(avatarUrl)}" x="${cx - 40}" y="${ay - 40}" width="80" height="80" clip-path="url(#av)" preserveAspectRatio="xMidYMid slice"/>`
    : `<circle cx="${cx}" cy="${ay}" r="44" fill="#ffffff"/><circle cx="${cx}" cy="${ay}" r="40" fill="${c1}"/><text x="${cx}" y="${ay + 14}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="38" fill="#ffffff">${escapeXml(initials(name))}</text>`;
  const title = balancedTitle(copy.title, 25);
  const titleY = title.length === 1 ? Y + 162 : Y + 150;
  const titleSvg = title.map((l, i) => `<text x="${cx}" y="${titleY + i * 42}" text-anchor="middle" font-family="Inter" font-weight="800" font-size="38" fill="#ffffff">${escapeXml(l)}</text>`).join("");
  const handleY = titleY + (title.length - 1) * 42 + 44;
  const body = wrapLines(copy.body, 34, 2);
  const bodyTop = Y + HEAD + BODY / 2 - (body.length - 1) * 16 + 10;
  const bodySvg = body.map((l, i) => `<text x="${cx}" y="${bodyTop + i * 32}" text-anchor="middle" font-family="Inter" font-weight="500" font-size="28" fill="#7a746e">${escapeXml(l)}</text>`).join("");
  const pillY = Y + HEAD + BODY + 26;
  const cta = escapeXml(copy.cta.length > 36 ? `${copy.cta.slice(0, 35)}…` : copy.cta);
  // Inter Bold 25 px ≈ 14 px per character; arrow + gap sit left of the centred text.
  const textW = Math.min(copy.cta.length, 36) * 14;
  const pillW = Math.min(W, Math.max(380, textW + 120));
  const arrowX = cx + 16 - textW / 2 - 26;
  const defs = `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
    <linearGradient id="head" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
    <clipPath id="card"><rect x="${X}" y="${Y}" width="${W}" height="${HEAD + BODY}" rx="${R}"/></clipPath>
  </defs>`;
  const content = `  <rect x="${X}" y="${Y + 8}" width="${W}" height="${HEAD + BODY}" rx="${R}" fill="#000000" fill-opacity="0.18"/>
  <g clip-path="url(#card)">
    <rect x="${X}" y="${Y}" width="${W}" height="${HEAD + BODY}" fill="#ffffff"/>
    <rect x="${X}" y="${Y}" width="${W}" height="${HEAD}" fill="url(#head)"/>
    ${avatar}
    ${titleSvg}
    <text x="${cx}" y="${handleY}" text-anchor="middle" font-family="Inter" font-weight="600" font-size="24" fill="#ffffff" fill-opacity="0.9">@${escapeXml(handle)}</text>
    ${bodySvg}
  </g>
  <rect x="${cx - pillW / 2}" y="${pillY}" width="${pillW}" height="64" rx="32" fill="#ffffff"/>
  <path d="M${arrowX - 10} ${pillY + 40} l10 -16 l10 16 m-10 -16 v20" stroke="${c1}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="${cx + 16}" y="${pillY + 42}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="25" fill="#131211">${cta}</text>
  <text x="${cx}" y="${pillY + 108}" text-anchor="middle" font-family="Inter" font-weight="600" font-size="22" fill="#ffffff" fill-opacity="0.85">${escapeXml(input.urlLabel)}</text>`;
  const format = input.format ?? "landscape";
  if (format === "landscape") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  ${defs}
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="#000000" fill-opacity="0.18"/>
${content}
</svg>`;
  }
  // Tall formats: the same invitation, scaled up and centred inside the safe zone.
  const { width: FW, height: FH, safeTop, safeBottom } = OG_FORMATS[format];
  const box = { x: X, y: Y, w: W, h: pillY + 116 - Y };
  const scale = Math.min((FW - 120) / box.w, (FH - safeTop - safeBottom - 40) / box.h);
  const tx = (FW - box.w * scale) / 2 - box.x * scale;
  const ty = safeTop + (FH - safeTop - safeBottom - box.h * scale) / 2 - box.y * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${FW}" height="${FH}" viewBox="0 0 ${FW} ${FH}">
  ${defs}
  <rect width="${FW}" height="${FH}" fill="url(#bg)"/>
  <rect width="${FW}" height="${FH}" fill="#000000" fill-opacity="0.18"/>
  <g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})">
${content}
  </g>
</svg>`;
}

/** Absolute PNG URL of a share card (crawlers need absolute https). */
export function shareCardUrl(handle: string, kind: ShareCardKind, lang: ShareCardLang, space: "root" | "alias" = "root", format: OgFormat = "landscape"): string {
  return `https://rout.be${shareCardPath(handle, kind, lang, space, format)}`;
}

/** Relative PNG path of a share card in one format (Studio previews and downloads). */
export function shareCardPath(handle: string, kind: ShareCardKind, lang: ShareCardLang, space: "root" | "alias" = "root", format: OgFormat = "landscape"): string {
  const q = new URLSearchParams({ card: kind, lang });
  if (space === "alias") q.set("space", "alias");
  const f = ogFormatQuery(format);
  return `/api/public/og/${encodeURIComponent(handle)}.png?${q.toString()}${f ? `&${f}` : ""}`;
}

/** og/twitter image tags for a share card, with the size and type Snapchat and WhatsApp expect. */
export function shareCardMeta(handle: string, kind: ShareCardKind, lang: ShareCardLang, space: "root" | "alias" = "root") {
  const url = shareCardUrl(handle, kind, lang, space);
  const alt = `${shareCardCopy(kind, lang).title} @${handle}`;
  return [
    { property: "og:image", content: url },
    { property: "og:image:secure_url", content: url },
    { property: "og:image:type", content: "image/png" },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: alt },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:image", content: url },
  ];
}
