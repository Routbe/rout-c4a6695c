import { BRAND, bunny, LOGO_VIEWBOX } from "@/lib/brand/logo";
import { harmonizeGlow, harmonizeProfileBackground, hexToOklch, LOGO_TONES, oklchToHex, pickLogoTone, shadeTile, type LogoTone } from "./wallet-color";

/**
 * Google-only pass artwork ("Sovereign Foil", v4). Apple and the in-app 3D card
 * keep their own palette. Everything is drawn in vectors from the official ROUT
 * bunny and rasterised by the Worker-safe resvg renderer.
 *
 * Google's guidelines shape the design: the hero carries no words (it is never
 * localised), keeps 20dp breathing room top and bottom, and is transparent so the
 * pass tile colour shows through seamlessly.
 */
export const GOOGLE_PASS_DESIGN = {
  /** Full-bleed background of the circular logo: official ROUT ink. */
  background: BRAND.ink,
  pearl: "#fbf6ea",
  gold: "#e6cd92",
  logoSize: 660,
  /** Google masks the logo into a circle and asks for at least 15 % margin. */
  logoPadding: 0.175,
  heroWidth: 1032,
  heroHeight: 812,
  /** 20dp at the 3x density Google renders the hero at. */
  heroPadding: 60,
} as const;

export type GoogleArtworkCard = {
  handle: string;
  space: "root" | "alias";
  displayName: string;
  sovereignId: string;
  accentHex?: string;
  /** Profile canvas colour (already mixed with the accent for Apple); harmonised again here. */
  hexBackgroundColor?: string;
  /** Verified root identity: adds the engraved check seal to the medallion. */
  verified?: boolean;
};
export type GoogleArtworkKind = "hero";

/** A design version is public artwork metadata, never an account ID or credential. */
export function googleArtworkVersion(card: GoogleArtworkCard): string {
  const data = JSON.stringify(["foil-v4", card.handle, card.space, card.displayName, card.sovereignId, card.accentHex, card.hexBackgroundColor ?? null, Boolean(card.verified)]);
  let hash = 2166136261;
  for (const char of data) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash.toString(36);
}

/** Member initials (kept for other surfaces); the Google hero itself carries no letters. */
export function walletMonogram(displayName: string, handle: string): string {
  const words = displayName.replace(/^@/, "").split(/[\s._-]+/u).map((w) => Array.from(w.replace(/[^\p{L}\p{N}]/gu, ""))[0]).filter(Boolean) as string[];
  const letters = words.length >= 2 ? [words[0]!, words[words.length - 1]!] : words.slice(0, 1);
  const out = letters.join("") || Array.from(handle.replace(/[^\p{L}\p{N}]/gu, ""))[0] || "R";
  return out.toLocaleUpperCase("nl-BE");
}

/** Harmonised (OKLab) tile colour derived from the member's canvas + accent. */
export const googlePassBackground = (card: Pick<GoogleArtworkCard, "accentHex" | "hexBackgroundColor">) => harmonizeProfileBackground(card.hexBackgroundColor, card.accentHex);

/**
 * Official ROUT badge for Google's circular logo slot: the bunny inside the purple
 * and mint rings, all within the safe circle, on a full-bleed background.
 */
export function googlePremiumLogoSvg(bg: string = GOOGLE_PASS_DESIGN.background, tone: LogoTone = pickLogoTone(bg)): string {
  const d = GOOGLE_PASS_DESIGN;
  const c = d.logoSize / 2;
  const safe = c * (1 - 2 * d.logoPadding) + 16; // ring sits on the edge of the 15 % safe circle
  const sw = safe * 0.05;
  const ink = tone === "light" ? BRAND.paper : LOGO_TONES.dark;
  const bw = safe * 1.2;
  const bh = (bw * LOGO_VIEWBOX.height) / LOGO_VIEWBOX.width;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${d.logoSize}" height="${d.logoSize}" viewBox="0 0 ${d.logoSize} ${d.logoSize}"><rect width="${d.logoSize}" height="${d.logoSize}" fill="${bg}"/>`
    + `<circle cx="${c}" cy="${c}" r="${safe - sw / 2}" fill="none" stroke="${BRAND.purple}" stroke-width="${sw}"/>`
    + `<circle cx="${c}" cy="${c}" r="${safe * 0.86}" fill="none" stroke="${BRAND.mint}" stroke-width="${sw}"/>`
    + `${bunny(c - bw / 2, c - bh / 2 - safe * 0.02, bw, ink)}</svg>`;
}

/* ------------------------------------------------------------ hero artwork */

/** Deterministic per-card seed from the public card number (never the account id). */
function cardSeed(card: GoogleArtworkCard): number {
  let h = 2166136261;
  for (const c of `${card.space}:${card.sovereignId}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

const f1 = (n: number) => Math.round(n * 10) / 10;

/**
 * One guilloche band: `lines` closed curves r(θ) = R + a·sin(nθ + φ) + b·sin(mθ − 2φ),
 * phase-shifted against each other so they weave a banknote-style moiré.
 */
function guillocheBand(cx: number, cy: number, o: { R: number; a: number; b: number; n: number; m: number; lines: number; steps?: number }): string {
  const steps = o.steps ?? 480;
  let d = "";
  for (let i = 0; i < o.lines; i++) {
    const phi = (i / o.lines) * 2 * Math.PI;
    for (let s = 0; s <= steps; s++) {
      const t = (s / steps) * 2 * Math.PI;
      const r = o.R + o.a * Math.sin(o.n * t + phi) + o.b * Math.sin(o.m * t - 2 * phi);
      d += `${s ? "L" : "M"}${f1(cx + r * Math.cos(t))} ${f1(cy + r * Math.sin(t))}`;
    }
    d += "Z";
  }
  return d;
}

/** Horizontal security ribbon behind the medallion, so the art spans the full pass width. */
function ribbon(w: number, cy: number, lines: number, amp: number, waves: number, seed: number): string {
  let d = "";
  const steps = 200;
  for (let i = 0; i < lines; i++) {
    const ph = (i / lines) * Math.PI * 2 + (seed % 97) / 15;
    for (let s = 0; s <= steps; s++) {
      const x = (s / steps) * w;
      const t = (s / steps) * Math.PI * 2 * waves;
      const y = cy + amp * Math.sin(t + ph) + amp * 0.35 * Math.sin(2.5 * t - ph);
      d += `${s ? "L" : "M"}${f1(x)} ${f1(y)}`;
    }
  }
  return d;
}

/**
 * Premium hero (1032×812, transparent): a guilloche medallion unique to every card
 * number, iridescent foil in the member's own hue + ROUT purple and mint, the
 * official bunny embossed in pearl, and an engraved check seal for verified members.
 */
export function googlePremiumArtworkSvg(card: GoogleArtworkCard, _kind: GoogleArtworkKind = "hero"): string {
  const d = GOOGLE_PASS_DESIGN;
  const w = d.heroWidth;
  const h = d.heroHeight;
  const cx = w / 2;
  const cy = h / 2;
  const outer = cy - d.heroPadding; // 346: medallion never touches top/bottom
  const tile = googlePassBackground(card);
  const deep = shadeTile(tile, -0.1, 0.9);
  const lift = shadeTile(tile, 0.16, 1.1);
  const glow = harmonizeGlow(card.accentHex ?? card.hexBackgroundColor);
  const tileHue = hexToOklch(tile)?.h ?? 4.4;
  const foilHue = oklchToHex({ L: 0.86, C: 0.09, h: tileHue });
  const mint = oklchToHex({ L: 0.88, C: 0.1, h: hexToOklch(BRAND.mint)!.h });
  const violet = oklchToHex({ L: 0.78, C: 0.12, h: hexToOklch(BRAND.purple)!.h });

  const seed = cardSeed(card);
  const n = 9 + (seed % 7); // 9..15 petals: every card number weaves its own rosette
  const n2 = 6 + ((seed >>> 3) % 5);
  const m = 2 * n + 1 + ((seed >>> 7) % 3);

  const outerBand = guillocheBand(cx, cy, { R: outer - 58, a: 20, b: 7, n, m, lines: 16 });
  const innerBand = guillocheBand(cx, cy, { R: outer - 132, a: 12, b: 4, n: n2 * 2, m: n2 * 3 + 1, lines: 12 });
  const ticks = Array.from({ length: 144 }, (_, i) => {
    const a = (i / 144) * Math.PI * 2;
    const r1 = outer - 8;
    const r2 = outer - (i % 6 ? 14 : 22);
    return `M${f1(cx + Math.cos(a) * r1)} ${f1(cy + Math.sin(a) * r1)}L${f1(cx + Math.cos(a) * r2)} ${f1(cy + Math.sin(a) * r2)}`;
  }).join("");
  const dots = Array.from({ length: 72 }, (_, i) => {
    const a = (i / 72) * Math.PI * 2 + Math.PI / 72;
    const r = outer - 92;
    return `<circle cx="${f1(cx + Math.cos(a) * r)}" cy="${f1(cy + Math.sin(a) * r)}" r="${i % 3 ? 1.4 : 2.4}"/>`;
  }).join("");

  const disc = outer - 176;
  const bw = disc * 1.3;
  const bh = (bw * LOGO_VIEWBOX.height) / LOGO_VIEWBOX.width;

  let seal = "";
  if (card.verified) {
    const a = Math.PI / 4;
    const sx = cx + Math.cos(a) * (outer - 30);
    const sy = cy + Math.sin(a) * (outer - 30);
    const sr = 30;
    seal = `<g filter="url(#lift)"><circle cx="${f1(sx)}" cy="${f1(sy)}" r="${sr + 6}" fill="${tile}"/><circle cx="${f1(sx)}" cy="${f1(sy)}" r="${sr}" fill="url(#foil)"/><circle cx="${f1(sx)}" cy="${f1(sy)}" r="${sr - 5}" fill="none" stroke="${deep}" stroke-opacity=".35" stroke-width="1.2"/><path d="M${f1(sx - sr * 0.42)} ${f1(sy + sr * 0.02)}L${f1(sx - sr * 0.1)} ${f1(sy + sr * 0.34)}L${f1(sx + sr * 0.46)} ${f1(sy - sr * 0.3)}" fill="none" stroke="${deep}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>`
    + `<linearGradient id="foil" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${d.pearl}"/><stop offset=".22" stop-color="${mint}"/><stop offset=".45" stop-color="${foilHue}"/><stop offset=".62" stop-color="${d.gold}"/><stop offset=".8" stop-color="${violet}"/><stop offset="1" stop-color="${d.pearl}"/></linearGradient>`
    + `<linearGradient id="foil2" x1="1" y1="0" x2="0" y2="1"><stop stop-color="${violet}"/><stop offset=".5" stop-color="${d.pearl}"/><stop offset="1" stop-color="${mint}"/></linearGradient>`
    + `<linearGradient id="pearl" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffffff"/><stop offset=".55" stop-color="${d.pearl}"/><stop offset="1" stop-color="${foilHue}"/></linearGradient>`
    + `<radialGradient id="ambient" cx="50%" cy="50%" r="50%"><stop stop-color="${glow}" stop-opacity=".34"/><stop offset=".55" stop-color="${glow}" stop-opacity=".08"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient>`
    + `<radialGradient id="disc" cx="38%" cy="30%" r="80%"><stop stop-color="${lift}"/><stop offset=".6" stop-color="${tile}"/><stop offset="1" stop-color="${deep}"/></radialGradient>`
    + `<linearGradient id="fade" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#fff" stop-opacity="0"/><stop offset=".2" stop-color="#fff" stop-opacity="1"/><stop offset=".8" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
    + `<mask id="edge"><rect width="${w}" height="${h}" fill="url(#fade)"/></mask>`
    + `<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset=".3" stop-color="#fff" stop-opacity="0"/><stop offset=".47" stop-color="#fff" stop-opacity=".16"/><stop offset=".53" stop-color="#fff" stop-opacity=".05"/><stop offset=".7" stop-color="#fff" stop-opacity="0"/></linearGradient>`
    + `<clipPath id="medal"><circle cx="${cx}" cy="${cy}" r="${outer}"/></clipPath>`
    + `<filter id="lift" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="${deep}" flood-opacity=".75"/></filter>`
    + `<filter id="emboss" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#000" flood-opacity=".45"/></filter>`
    + `</defs>`
    // ambient glow + full-width ribbon
    + `<ellipse cx="${cx}" cy="${cy}" rx="${w * 0.62}" ry="${outer * 1.15}" fill="url(#ambient)"/>`
    + `<g mask="url(#edge)" fill="none" stroke="url(#foil2)" stroke-width=".9" stroke-opacity=".4"><path d="${ribbon(w, cy, 22, 34, 4, seed)}"/></g>`
    // medallion body
    + `<circle cx="${cx}" cy="${cy}" r="${outer}" fill="${deep}" fill-opacity=".55"/>`
    + `<g clip-path="url(#medal)"><path d="${outerBand}" fill="none" stroke="url(#foil)" stroke-width=".9" stroke-opacity=".8"/></g>`
    + `<circle cx="${cx}" cy="${cy}" r="${outer}" fill="none" stroke="url(#foil)" stroke-width="2.4"/>`
    + `<path d="${ticks}" stroke="url(#foil)" stroke-width="1.6"/>`
    + `<circle cx="${cx}" cy="${cy}" r="${outer - 30}" fill="none" stroke="url(#foil)" stroke-width=".9" stroke-opacity=".7"/>`
    + `<g fill="url(#foil)" fill-opacity=".85">${dots}</g>`
    + `<path d="${innerBand}" fill="none" stroke="url(#foil2)" stroke-width="1" stroke-opacity=".7"/>`
    // inner disc + bunny
    + `<g filter="url(#lift)"><circle cx="${cx}" cy="${cy}" r="${disc}" fill="url(#disc)"/></g>`
    + `<circle cx="${cx}" cy="${cy}" r="${disc}" fill="none" stroke="url(#foil)" stroke-width="3"/>`
    + `<circle cx="${cx}" cy="${cy}" r="${disc - 12}" fill="none" stroke="url(#foil)" stroke-width=".8" stroke-opacity=".6"/>`
    + `<g filter="url(#emboss)">${bunny(cx - bw / 2, cy - bh / 2 - disc * 0.02, bw, "url(#pearl)")}</g>`
    // holographic sheen across the medallion
    + `<rect x="${cx - outer}" y="${cy - outer}" width="${outer * 2}" height="${outer * 2}" fill="url(#sheen)" clip-path="url(#medal)"/>`
    + seal
    + `</svg>`;
}
