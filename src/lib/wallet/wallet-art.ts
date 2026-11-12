/**
 * Vector artwork for Google Wallet passes, drawn in code from the official
 * ROUT logo (src/lib/brand/logo.ts) — never AI-generated. The same SVGs are
 * rasterised to the static PNGs in public/assets/wallet and, per card, by
 * /api/wallet/render/<card>/hero.png.
 */
import { BRAND, bunny, bunnyWithRings } from "@/lib/brand/logo";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const HEX6 = /^#[0-9a-f]{6}$/i;
const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const hexOf = (c: number[]) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;

/** Mixes `b` into `a` by `t` (0..1). */
export function mixHex(a: string, b: string, t: number): string {
  const x = rgbOf(a), y = rgbOf(b);
  return hexOf(x.map((v, i) => v + ((y[i] ?? v) - v) * t));
}

/** Saturation (0..1) of a hex colour. */
export function saturation(hex: string): number {
  const c = rgbOf(hex).map((v) => v / 255);
  const max = Math.max(...c), min = Math.min(...c);
  return max === 0 ? 0 : (max - min) / max;
}

/**
 * Pass background in the member's own colour. Neutral grey/black canvases are
 * tinted with the profile accent so the closed pass in the Wallet list is never
 * a flat grey block.
 */
export function walletCardColor(bg: string | null | undefined, accent: string | null | undefined): string {
  const base = bg && HEX6.test(bg) ? bg.toLowerCase() : BRAND.ink;
  const acc = accent && HEX6.test(accent) ? accent.toLowerCase() : BRAND.purple;
  if (saturation(base) >= 0.25) return base;
  return mixHex(mixHex(BRAND.ink, acc, 0.55), "#000000", 0.25);
}

/** Square logo (660×660): official bunny inside the purple/mint rings on ink. */
export function walletLogoSvg(size = 660): string {
  const r = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${BRAND.ink}"/>${bunnyWithRings(r, r, r * 0.92, BRAND.paper)}</svg>`;
}

function guilloche(w: number, h: number, color: string, opacity: number): string {
  let paths = "";
  for (let k = 0; k < 14; k++) {
    let d = "";
    for (let x = 0; x <= w; x += 8) {
      const y = h * 0.55 + Math.sin(x / (38 + k * 3) + k * 0.7) * (h * 0.18) + Math.sin(x / 11 + k) * 4 + (k - 7) * 9;
      d += `${x === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }
    paths += `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.2" opacity="${opacity}"/>`;
  }
  return paths;
}

/** Sovereign seal (660×660): decorative brand emblem, not a certification. */
export function sovereignSealSvg(size = 660): string {
  const c = 330;
  const engraving = Array.from({ length: 120 }, (_, i) => {
    const a = (i / 120) * Math.PI * 2;
    return `<path d="M${c + Math.cos(a) * 256} ${c + Math.sin(a) * 256}L${c + Math.cos(a) * (i % 5 ? 268 : 280)} ${c + Math.sin(a) * (i % 5 ? 268 : 280)}" stroke="url(#metal)" stroke-width="${i % 5 ? 1 : 2}"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 660 660">
<defs><linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${BRAND.paper}"/><stop offset=".22" stop-color="${mixHex(BRAND.ink, BRAND.paper, .5)}"/><stop offset=".44" stop-color="${BRAND.paper}"/><stop offset=".7" stop-color="${mixHex(BRAND.ink, BRAND.paper, .28)}"/><stop offset="1" stop-color="${BRAND.paper}"/></linearGradient><radialGradient id="face" cx="35%" cy="25%" r="80%"><stop stop-color="${mixHex(BRAND.ink, BRAND.paper, .12)}"/><stop offset="1" stop-color="${BRAND.ink}"/></radialGradient></defs>
<rect width="660" height="660" fill="${BRAND.ink}"/>
<circle cx="330" cy="330" r="302" fill="url(#face)" stroke="url(#metal)" stroke-width="3"/>
<circle cx="330" cy="330" r="290" fill="none" stroke="url(#metal)" stroke-width="1"/>${engraving}
<circle cx="330" cy="330" r="238" fill="none" stroke="url(#metal)" stroke-width="2"/>
<circle cx="330" cy="330" r="226" fill="none" stroke="${BRAND.mint}" stroke-width="1" opacity=".6"/>
${guilloche(450, 380, BRAND.mint, .045).replace(/<path /g, '<path transform="translate(105 105)" ')}
${bunny(244, 183, 172, BRAND.paper)}
<text x="330" y="418" text-anchor="middle" font-family="Inter, sans-serif" font-weight="600" font-size="46" fill="${BRAND.paper}">ROUT</text>
<path d="M278 443h104" stroke="${BRAND.mint}" stroke-width="2"/>
<text x="330" y="477" text-anchor="middle" font-family="Inter, sans-serif" font-size="14" fill="${BRAND.paper}" opacity=".8">YOUR IDENTITY. YOUR CHOICE.</text>
</svg>`;
}

/** Compliance array (1032×336): trust bar shown as an image module on the pass. */
export function complianceArraySvg(): string {
  const w = 1032, h = 336;
  const items = [["PROFILE", "Public identity"], ["QR", "Public destination"], ["NFC", "Separate verification"], ["PASSKEY", "WebAuthn"], ["CONTROL", "Your choices"]];
  const cw = (w - 80) / items.length;
  const cells = items.map(([k, v], i) => {
    const x = 40 + i * cw;
    return `<path d="M${x + 10} 158h${cw - 20}" stroke="${i % 2 ? BRAND.purple : BRAND.mint}" stroke-width="3"/>
<text x="${x + 10}" y="192" font-family="Inter, sans-serif" font-size="14" fill="${BRAND.mint}">0${i + 1}</text>
<text x="${x + 10}" y="230" font-family="Inter, sans-serif" font-weight="600" font-size="25" fill="${BRAND.paper}">${k}</text>
<text x="${x + 10}" y="266" font-family="Inter, sans-serif" font-size="16" fill="${BRAND.paper}" opacity="0.75">${v}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${BRAND.ink}"/>${guilloche(w, h, BRAND.mint, 0.08)}
${bunny(40, 40, 64, BRAND.paper)}
<text x="124" y="86" font-family="Inter, sans-serif" font-weight="600" font-size="30" letter-spacing="0" fill="${BRAND.paper}">Identity. With clear boundaries.</text>
<text x="124" y="114" font-family="Inter, sans-serif" font-size="18" fill="${BRAND.paper}" opacity="0.75">A public profile card is not an account access credential.</text>${cells}</svg>`;
}

export type HeroCard = { displayName: string; handle: string; sovereignId: string; bg: string; accent: string; fg: string; space: "root" | "alias" };

/** Hero image (1032×336, Google's 3.07:1 hero ratio): the front of the member's ROUT Card. */
export function walletHeroSvg(c: HeroCard): string {
  const w = 1032, h = 336;
  const light = mixHex(c.bg, "#ffffff", 0.18), dark = mixHex(c.bg, "#000000", 0.45);
  const name = Array.from(c.displayName).slice(0, 60).join("");
  const nameSize = Math.min(44, Math.max(16, Math.floor(620 / Math.max(1, Array.from(name).length * 0.62))));
  const label = `${c.space === "alias" ? "@u/" : "@"}${c.handle}`;
  const handleSize = Math.min(22, Math.max(13, Math.floor(620 / Math.max(1, Array.from(label).length * 0.65))));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
<linearGradient id="base" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="0.55" stop-color="${c.bg}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0.4"><stop offset="0.25" stop-color="${BRAND.paper}" stop-opacity="0"/><stop offset="0.5" stop-color="${BRAND.paper}" stop-opacity="0.08"/><stop offset="0.75" stop-color="${BRAND.paper}" stop-opacity="0"/></linearGradient>
</defs>
<rect width="${w}" height="${h}" fill="url(#base)"/>
${guilloche(w, h, c.accent, 0.10)}
<path d="M730 30v276" stroke="${c.fg}" stroke-opacity="0.2"/>
${bunnyWithRings(870, 162, 106, c.fg)}
<rect width="${w}" height="${h}" fill="url(#sheen)"/>
${bunny(48, 36, 46, c.fg)}
<text x="106" y="72" font-family="Inter, sans-serif" font-weight="600" font-size="28" letter-spacing="0" fill="${c.fg}">ROUT</text>
<text x="48" y="128" font-family="Inter, sans-serif" font-size="14" letter-spacing="0" fill="${c.fg}" opacity="0.8">${c.space === "alias" ? "ALIAS" : "PROFILE"} / ROUT CARD</text>
<text x="48" y="194" font-family="Inter, sans-serif" font-weight="600" font-size="${nameSize}" letter-spacing="0" fill="${c.fg}">${esc(name)}</text>
<text x="48" y="232" font-family="Inter, sans-serif" font-size="${handleSize}" letter-spacing="0" fill="${c.fg}" opacity="0.85">${esc(label)}</text>
<path d="M48 258h634" stroke="${c.fg}" stroke-opacity="0.2"/>
<text x="48" y="295" font-family="Inter, sans-serif" font-size="18" letter-spacing="0" fill="${c.fg}">${esc(c.sovereignId)}</text>
<text x="870" y="304" text-anchor="middle" font-family="Inter, sans-serif" font-size="12" fill="${c.fg}" opacity="0.85">YOUR IDENTITY. YOUR CHOICE.</text>
<rect x="1" y="1" width="${w - 2}" height="${h - 2}" fill="none" stroke="${c.accent}" stroke-opacity="0.45" stroke-width="2"/>
</svg>`;
}

/** Wide logo (1280×400, Google Wallet "wide logo" field): bunny + ROUT wordmark on ink. */
export function walletWideLogoSvg(): string {
  const w = 1280, h = 400;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${BRAND.ink}"/>
${bunnyWithRings(390, h / 2, 150, BRAND.paper)}
<text x="590" y="246" font-family="Inter, sans-serif" font-weight="600" font-size="150" letter-spacing="0" fill="${BRAND.paper}">ROUT</text></svg>`;
}

/** Brand hero (1032×336): generic class-level hero showing a ROUT Card without personal data. */
export function walletBrandHeroSvg(): string {
  return walletHeroSvg({ displayName: "ROUT Card", handle: "rout", sovereignId: "YOUR IDENTITY. YOUR CHOICE.", bg: walletCardColor(BRAND.ink, BRAND.mint), accent: BRAND.mint, fg: BRAND.paper, space: "root" });
}

/** Image module (1860×620): ROUT Card front beside its three scan layers. */
export function walletCardModuleSvg(): string {
  const w = 1860, h = 620;
  const rows = [["Public QR", "Public profile or card status. No sign-in."], ["NFC handshake", "Separate verification with a compatible reader."], ["Rotating token", "Owner-only, single-use digital proof."]];
  const list = rows.map(([k, v], i) => `<circle cx="1040" cy="${232 + i * 120}" r="10" fill="${i % 2 ? BRAND.purple : BRAND.mint}"/>
<text x="1072" y="${242 + i * 120}" font-family="Inter, sans-serif" font-weight="600" font-size="40" fill="${BRAND.paper}">${k}</text>
<text x="1072" y="${284 + i * 120}" font-family="Inter, sans-serif" font-size="26" fill="${BRAND.paper}" opacity="0.62">${v}</text>`).join("");
  const card = walletBrandHeroSvg().replace(/^<svg [^>]*?width="\d+" height="\d+"/, `<svg xmlns="http://www.w3.org/2000/svg" x="80" y="142" width="860" height="280"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${BRAND.ink}"/>${guilloche(w, h, BRAND.purple, 0.07)}
<text x="80" y="96" font-family="Inter, sans-serif" font-weight="600" font-size="30" letter-spacing="0" fill="${BRAND.mint}">ROUT CARD / THREE DISTINCT LAYERS</text>
${card}${list}</svg>`;
}
