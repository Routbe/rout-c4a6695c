// Frame library for Phase 4 — Sovereign QR Frame Assortment.
// Each frame is a pure SVG generator with a fixed 400x500 viewBox and a
// 300x300 QR slot positioned at (50, 50). Downloads composite the QR into
// this SVG so the exported artefact matches the preview 1:1.

export type FrameCategory =
  | "none"
  | "standard"
  | "beauty"
  | "food"
  | "entertainment"
  | "community"
  | "events"
  | "shopping"
  | "payment"
  | "wifi"
  | "business"
  | "travel"
  | "social"
  | "all";

export interface FrameDef {
  id: string;
  name: string;
  category: Exclude<FrameCategory, "all" | "none">;
  defaultLabel: string;
  /** Returns raw SVG markup for the whole frame (viewBox 0 0 400 500). */
  render: (opts: FrameRenderOpts) => string;
}

export interface FrameRenderOpts {
  color: string;
  bg: string;
  label: string;
  /** Data URL / URL of the QR raster to embed inside the slot. */
  qrHref?: string;
  /** If provided, inject raw <svg> content instead of an <image>. */
  qrSvgInner?: string;
  /** Optional CTA font family override (see FRAME_FONTS). */
  font?: string;
}

/** Selectable CTA typefaces for frame labels. */
export const FRAME_FONTS: { id: string; label: string; stack: string }[] = [
  { id: "sans", label: "Grotesk", stack: "ui-sans-serif, system-ui, sans-serif" },
  { id: "serif", label: "Serif", stack: "Georgia, 'Times New Roman', serif" },
  { id: "mono", label: "Mono", stack: "ui-monospace, 'SFMono-Regular', Menlo, monospace" },
  { id: "rounded", label: "Rounded", stack: "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif" },
  {
    id: "condensed",
    label: "Condensed",
    stack: "'Arial Narrow', 'Haettenschweiler', Impact, sans-serif",
  },
];

export const frameFontStack = (id?: string | null) =>
  FRAME_FONTS.find((f) => f.id === id)?.stack ?? null;

export const FRAME_VIEWBOX = { w: 400, h: 500 };
export const FRAME_QR_SLOT = { x: 50, y: 50, size: 300 };

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const qrSlot = (opts: FrameRenderOpts) => {
  const { x, y, size } = FRAME_QR_SLOT;
  if (opts.qrSvgInner) {
    return `<g transform="translate(${x} ${y})">${opts.qrSvgInner}</g>`;
  }
  if (opts.qrHref) {
    return `<image href="${opts.qrHref}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet" />`;
  }
  // Placeholder checker so the preview shows where the QR will sit.
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="none" stroke="${opts.color}" stroke-dasharray="4 4" opacity="0.35" />`;
};

const wrap = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FRAME_VIEWBOX.w} ${FRAME_VIEWBOX.h}" width="100%" height="100%">${inner}</svg>`;

// ─────────────── STANDARD ───────────────
const standardHairline: FrameDef = {
  id: "std-hairline",
  name: "Hairline",
  category: "standard",
  defaultLabel: "SCAN ME",
  render: (o) =>
    wrap(`
      <rect x="10" y="10" width="380" height="480" rx="22" fill="${o.bg}" stroke="${o.color}" stroke-width="1.5" />
      ${qrSlot(o)}
      <text x="200" y="430" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="26" font-weight="600" letter-spacing="6">${escape(o.label)}</text>
    `),
};

const standardBracket: FrameDef = {
  id: "std-bracket",
  name: "Bracket",
  category: "standard",
  defaultLabel: "SCAN",
  render: (o) => {
    const c = o.color;
    return wrap(`
      <rect x="0" y="0" width="400" height="500" fill="${o.bg}" />
      <path d="M30 30 L30 90 M30 30 L90 30" stroke="${c}" stroke-width="3" fill="none" />
      <path d="M370 30 L370 90 M370 30 L310 30" stroke="${c}" stroke-width="3" fill="none" />
      <path d="M30 470 L30 410 M30 470 L90 470" stroke="${c}" stroke-width="3" fill="none" />
      <path d="M370 470 L370 410 M370 470 L310 470" stroke="${c}" stroke-width="3" fill="none" />
      ${qrSlot(o)}
      <text x="200" y="420" text-anchor="middle" fill="${c}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="28" font-weight="500" letter-spacing="10">${escape(o.label)}</text>
    `);
  },
};

// ─────────────── BEAUTY ───────────────
const beautyOrganic: FrameDef = {
  id: "beauty-organic",
  name: "Organic",
  category: "beauty",
  defaultLabel: "Discover",
  render: (o) =>
    wrap(`
      <path d="M60 20 Q200 -10 340 20 Q400 100 380 250 Q400 400 340 480 Q200 510 60 480 Q0 400 20 250 Q0 100 60 20 Z" fill="${o.bg}" stroke="${o.color}" stroke-width="1" opacity="0.95"/>
      ${qrSlot(o)}
      <text x="200" y="425" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `Georgia, 'Times New Roman', serif`}" font-style="italic" font-size="30">${escape(o.label)}</text>
    `),
};

const beautyEditorial: FrameDef = {
  id: "beauty-editorial",
  name: "Editorial",
  category: "beauty",
  defaultLabel: "The Studio",
  render: (o) =>
    wrap(`
      <rect x="0" y="0" width="400" height="500" fill="${o.bg}" />
      <line x1="40" y1="380" x2="360" y2="380" stroke="${o.color}" stroke-width="0.5"/>
      ${qrSlot(o)}
      <text x="200" y="425" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `Georgia, serif`}" font-size="26" letter-spacing="2">${escape(o.label)}</text>
      <text x="200" y="455" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="11" letter-spacing="6" opacity="0.7">SCAN TO EXPLORE</text>
    `),
};

// ─────────────── FOOD & MENU ───────────────
const foodMenu: FrameDef = {
  id: "food-menu",
  name: "Menu Card",
  category: "food",
  defaultLabel: "View Menu",
  render: (o) =>
    wrap(`
      <rect x="15" y="15" width="370" height="470" rx="8" fill="${o.bg}" stroke="${o.color}" stroke-width="2"/>
      <rect x="15" y="15" width="370" height="34" fill="${o.color}"/>
      <text x="200" y="38" text-anchor="middle" fill="${o.bg}" font-family="${o.font ?? `Georgia, serif`}" font-size="15" letter-spacing="4">MENU</text>
      ${qrSlot(o)}
      <line x1="50" y1="395" x2="350" y2="395" stroke="${o.color}" stroke-width="0.5" opacity="0.4"/>
      <text x="200" y="430" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `Georgia, serif`}" font-size="26">${escape(o.label)}</text>
    `),
};

const foodChef: FrameDef = {
  id: "food-chef",
  name: "Chef",
  category: "food",
  defaultLabel: "Bon Appétit",
  render: (o) =>
    wrap(`
      <rect x="0" y="0" width="400" height="500" fill="${o.bg}" />
      <circle cx="200" cy="30" r="14" fill="none" stroke="${o.color}" stroke-width="1.5"/>
      <path d="M186 30 L214 30 M200 16 L200 44" stroke="${o.color}" stroke-width="1.5"/>
      ${qrSlot(o)}
      <text x="200" y="415" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `Georgia, serif`}" font-style="italic" font-size="26">${escape(o.label)}</text>
    `),
};

// ─────────────── ENTERTAINMENT ───────────────
const entertainmentPlay: FrameDef = {
  id: "ent-play",
  name: "Play",
  category: "entertainment",
  defaultLabel: "PLAY NOW",
  render: (o) =>
    wrap(`
      <rect x="10" y="10" width="380" height="480" rx="28" fill="${o.bg}" stroke="${o.color}" stroke-width="2"/>
      ${qrSlot(o)}
      <circle cx="200" cy="420" r="26" fill="${o.color}"/>
      <polygon points="192,408 192,432 214,420" fill="${o.bg}"/>
      <text x="200" y="472" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="18" font-weight="700" letter-spacing="4">${escape(o.label)}</text>
    `),
};

// ─────────────── COMMUNITY ───────────────
const communityChat: FrameDef = {
  id: "com-chat",
  name: "Chat Bubble",
  category: "community",
  defaultLabel: "Join the chat",
  render: (o) =>
    wrap(`
      <path d="M20 20 H380 A20 20 0 0 1 400 40 V380 A20 20 0 0 1 380 400 H240 L200 440 L160 400 H20 A20 20 0 0 1 0 380 V40 A20 20 0 0 1 20 20 Z" fill="${o.bg}" stroke="${o.color}" stroke-width="2"/>
      ${qrSlot(o)}
      <text x="200" y="480" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="20" font-weight="600">${escape(o.label)}</text>
    `),
};

// ─────────────── EVENTS ───────────────
const eventTicket: FrameDef = {
  id: "evt-ticket",
  name: "Ticket",
  category: "events",
  defaultLabel: "ADMIT ONE",
  render: (o) => {
    return wrap(`
      <defs>
        <mask id="ticketMask">
          <rect x="0" y="0" width="400" height="500" fill="white"/>
          <circle cx="0" cy="250" r="16" fill="black"/>
          <circle cx="400" cy="250" r="16" fill="black"/>
        </mask>
      </defs>
      <rect x="10" y="10" width="380" height="480" rx="14" fill="${o.bg}" stroke="${o.color}" stroke-width="2" mask="url(#ticketMask)"/>
      <line x1="30" y1="250" x2="370" y2="250" stroke="${o.color}" stroke-dasharray="4 6" opacity="0.5"/>
      ${qrSlot(o)}
      <text x="200" y="425" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="24" font-weight="700" letter-spacing="6">${escape(o.label)}</text>
      <text x="200" y="465" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="10" letter-spacing="4" opacity="0.6">SCAN AT ENTRANCE</text>
    `);
  },
};

// ─────────────── SHOPPING ───────────────
const shoppingTag: FrameDef = {
  id: "shop-tag",
  name: "Price Tag",
  category: "shopping",
  defaultLabel: "Shop Now",
  render: (o) =>
    wrap(`
      <path d="M40 20 H380 A20 20 0 0 1 400 40 V460 A20 20 0 0 1 380 480 H40 L10 250 Z" fill="${o.bg}" stroke="${o.color}" stroke-width="2"/>
      <circle cx="55" cy="250" r="8" fill="none" stroke="${o.color}" stroke-width="2"/>
      ${qrSlot(o)}
      <text x="200" y="420" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="24" font-weight="600">${escape(o.label)}</text>
    `),
};

const shoppingCart: FrameDef = {
  id: "shop-cart",
  name: "Cart",
  category: "shopping",
  defaultLabel: "BUY",
  render: (o) =>
    wrap(`
      <rect x="10" y="10" width="380" height="480" rx="18" fill="${o.bg}" stroke="${o.color}" stroke-width="1.5"/>
      ${qrSlot(o)}
      <g transform="translate(170 400)" stroke="${o.color}" stroke-width="2" fill="none">
        <path d="M0 4 L8 4 L14 30 L44 30 L50 10 L14 10"/>
        <circle cx="18" cy="40" r="4"/>
        <circle cx="40" cy="40" r="4"/>
      </g>
      <text x="240" y="435" fill="${o.color}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="22" font-weight="700" letter-spacing="4">${escape(o.label)}</text>
    `),
};

// ─────────────── PAYMENT ───────────────
const paymentTerminal: FrameDef = {
  id: "pay-terminal",
  name: "Terminal",
  category: "payment",
  defaultLabel: "SCAN TO PAY",
  render: (o) =>
    wrap(`
      <rect x="10" y="10" width="380" height="480" rx="26" fill="${o.bg}" stroke="${o.color}" stroke-width="2"/>
      <rect x="30" y="30" width="340" height="340" rx="18" fill="none" stroke="${o.color}" stroke-width="1" opacity="0.35"/>
      ${qrSlot(o)}
      <rect x="120" y="392" width="160" height="6" rx="3" fill="${o.color}" opacity="0.25"/>
      <text x="200" y="440" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="23" font-weight="700" letter-spacing="3">${escape(o.label)}</text>
      <text x="200" y="466" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="10" letter-spacing="4" opacity="0.6">SECURE PAYMENT</text>
    `),
};

const paymentReceipt: FrameDef = {
  id: "pay-receipt",
  name: "Receipt",
  category: "payment",
  defaultLabel: "PAY HERE",
  render: (o) =>
    wrap(`
      <path d="M30 14 H370 V470 L340 486 L310 470 L280 486 L250 470 L220 486 L190 470 L160 486 L130 470 L100 486 L70 470 L30 486 Z" fill="${o.bg}" stroke="${o.color}" stroke-width="2"/>
      ${qrSlot(o)}
      <line x1="70" y1="392" x2="330" y2="392" stroke="${o.color}" stroke-dasharray="3 5" opacity="0.5"/>
      <text x="200" y="432" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `ui-monospace, monospace`}" font-size="22" font-weight="700" letter-spacing="4">${escape(o.label)}</text>
    `),
};

// ─────────────── WI-FI ───────────────
const wifiSignal: FrameDef = {
  id: "wifi-signal",
  name: "Signal",
  category: "wifi",
  defaultLabel: "FREE WI-FI",
  render: (o) =>
    wrap(`
      <rect x="10" y="10" width="380" height="480" rx="22" fill="${o.bg}" stroke="${o.color}" stroke-width="2"/>
      ${qrSlot(o)}
      <g transform="translate(200 400)" stroke="${o.color}" stroke-width="3" fill="none" stroke-linecap="round">
        <path d="M-34 -6 A48 48 0 0 1 34 -6"/>
        <path d="M-21 6 A30 30 0 0 1 21 6"/>
        <circle cx="0" cy="18" r="3.5" fill="${o.color}" stroke="none"/>
      </g>
      <text x="200" y="462" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="22" font-weight="700" letter-spacing="3">${escape(o.label)}</text>
    `),
};

const wifiGuest: FrameDef = {
  id: "wifi-guest",
  name: "Guest Card",
  category: "wifi",
  defaultLabel: "Connect to our network",
  render: (o) =>
    wrap(`
      <rect x="10" y="10" width="380" height="480" rx="16" fill="${o.bg}" stroke="${o.color}" stroke-width="1.5"/>
      <rect x="10" y="10" width="380" height="26" rx="13" fill="${o.color}" opacity="0.12"/>
      ${qrSlot(o)}
      <text x="200" y="412" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="19" font-weight="600">${escape(o.label)}</text>
      <text x="200" y="444" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="11" opacity="0.6">Scan — no password needed</text>
    `),
};

// ─────────────── BUSINESS ───────────────
const businessCard: FrameDef = {
  id: "biz-card",
  name: "Business Card",
  category: "business",
  defaultLabel: "Save my contact",
  render: (o) =>
    wrap(`
      <rect x="10" y="10" width="380" height="480" rx="10" fill="${o.bg}" stroke="${o.color}" stroke-width="1.5"/>
      <rect x="10" y="10" width="8" height="480" fill="${o.color}"/>
      ${qrSlot(o)}
      <line x1="60" y1="392" x2="340" y2="392" stroke="${o.color}" stroke-width="1" opacity="0.3"/>
      <text x="200" y="430" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="21" font-weight="600">${escape(o.label)}</text>
      <text x="200" y="458" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="10" letter-spacing="4" opacity="0.55">ONE TAP · VCARD</text>
    `),
};

const businessCorporate: FrameDef = {
  id: "biz-corporate",
  name: "Corporate",
  category: "business",
  defaultLabel: "LEARN MORE",
  render: (o) =>
    wrap(`
      <rect x="10" y="10" width="380" height="480" rx="4" fill="${o.bg}" stroke="${o.color}" stroke-width="2"/>
      <rect x="10" y="386" width="380" height="104" fill="${o.color}"/>
      ${qrSlot(o)}
      <text x="200" y="442" text-anchor="middle" fill="${o.bg}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="24" font-weight="700" letter-spacing="4">${escape(o.label)}</text>
      <text x="200" y="466" text-anchor="middle" fill="${o.bg}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="10" letter-spacing="3" opacity="0.75">SCAN WITH YOUR CAMERA</text>
    `),
};

// ─────────────── TRAVEL ───────────────
const travelBoarding: FrameDef = {
  id: "travel-boarding",
  name: "Boarding Pass",
  category: "travel",
  defaultLabel: "BOARDING PASS",
  render: (o) =>
    wrap(`
      <rect x="10" y="10" width="380" height="480" rx="16" fill="${o.bg}" stroke="${o.color}" stroke-width="2"/>
      <line x1="10" y1="386" x2="390" y2="386" stroke="${o.color}" stroke-dasharray="5 6" opacity="0.55"/>
      ${qrSlot(o)}
      <g transform="translate(200 418)" fill="${o.color}">
        <path d="M-46 0 L-6 -12 L4 -26 L12 -26 L8 -10 L30 -16 L36 -24 L42 -24 L38 -10 L46 -6 L38 -2 L42 12 L36 12 L30 4 L8 -2 L12 14 L4 14 L-6 0 Z" opacity="0.85"/>
      </g>
      <text x="200" y="462" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="20" font-weight="700" letter-spacing="5">${escape(o.label)}</text>
    `),
};

const travelPassport: FrameDef = {
  id: "travel-passport",
  name: "Passport Stamp",
  category: "travel",
  defaultLabel: "EXPLORE",
  render: (o) =>
    wrap(`
      <rect x="10" y="10" width="380" height="480" rx="20" fill="${o.bg}" stroke="${o.color}" stroke-width="2"/>
      <rect x="26" y="26" width="348" height="448" rx="14" fill="none" stroke="${o.color}" stroke-width="1" stroke-dasharray="8 6" opacity="0.5"/>
      ${qrSlot(o)}
      <circle cx="200" cy="424" r="46" fill="none" stroke="${o.color}" stroke-width="2" opacity="0.55"/>
      <text x="200" y="431" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="18" font-weight="700" letter-spacing="3">${escape(o.label)}</text>
    `),
};

// ─────────────── SOCIAL ───────────────
const socialFollow: FrameDef = {
  id: "social-follow",
  name: "Follow Me",
  category: "social",
  defaultLabel: "FOLLOW ME",
  render: (o) =>
    wrap(`
      <rect x="10" y="10" width="380" height="480" rx="34" fill="${o.bg}" stroke="${o.color}" stroke-width="2"/>
      ${qrSlot(o)}
      <rect x="90" y="400" width="220" height="52" rx="26" fill="${o.color}"/>
      <text x="200" y="433" text-anchor="middle" fill="${o.bg}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="20" font-weight="700" letter-spacing="3">${escape(o.label)}</text>
    `),
};

const socialStory: FrameDef = {
  id: "social-story",
  name: "Story",
  category: "social",
  defaultLabel: "SWIPE UP",
  render: (o) =>
    wrap(`
      <rect x="10" y="10" width="380" height="480" rx="30" fill="${o.bg}" stroke="${o.color}" stroke-width="2"/>
      <rect x="150" y="26" width="100" height="6" rx="3" fill="${o.color}" opacity="0.35"/>
      ${qrSlot(o)}
      <g transform="translate(200 408)" stroke="${o.color}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="M-14 8 L0 -8 L14 8"/>
        <path d="M0 -8 L0 22"/>
      </g>
      <text x="200" y="464" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="20" font-weight="700" letter-spacing="4">${escape(o.label)}</text>
    `),
};

// ─────────────── EXPANDED SET ───────────────
const standardDouble: FrameDef = {
  id: "std-double",
  name: "Double Rule",
  category: "standard",
  defaultLabel: "SCAN ME",
  render: (o) =>
    wrap(`
      <rect x="8" y="8" width="384" height="484" rx="26" fill="${o.bg}" stroke="${o.color}" stroke-width="2"/>
      <rect x="22" y="22" width="356" height="456" rx="18" fill="none" stroke="${o.color}" stroke-width="1" opacity="0.45"/>
      ${qrSlot(o)}
      <text x="200" y="432" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="25" font-weight="600" letter-spacing="5">${escape(o.label)}</text>
    `),
};

const standardBadge: FrameDef = {
  id: "std-badge",
  name: "Pill Badge",
  category: "standard",
  defaultLabel: "SCAN ME",
  render: (o) =>
    wrap(`
      <rect x="10" y="10" width="380" height="480" rx="28" fill="${o.bg}" stroke="${o.color}" stroke-width="1.5"/>
      ${qrSlot(o)}
      <rect x="100" y="402" width="200" height="50" rx="25" fill="${o.color}"/>
      <text x="200" y="434" text-anchor="middle" fill="${o.bg}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="19" font-weight="700" letter-spacing="3">${escape(o.label)}</text>
    `),
};

const standardTicketNotch: FrameDef = {
  id: "std-notch",
  name: "Notched",
  category: "standard",
  defaultLabel: "SCAN HERE",
  render: (o) =>
    wrap(`
      <rect x="10" y="10" width="380" height="480" rx="20" fill="${o.bg}" stroke="${o.color}" stroke-width="1.5"/>
      <circle cx="10" cy="380" r="14" fill="${o.bg}" stroke="${o.color}" stroke-width="1.5"/>
      <circle cx="390" cy="380" r="14" fill="${o.bg}" stroke="${o.color}" stroke-width="1.5"/>
      <line x1="26" y1="380" x2="374" y2="380" stroke="${o.color}" stroke-dasharray="4 6" opacity="0.5"/>
      ${qrSlot(o)}
      <text x="200" y="440" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="23" font-weight="600" letter-spacing="4">${escape(o.label)}</text>
    `),
};

const businessHeader: FrameDef = {
  id: "biz-header",
  name: "Header Bar",
  category: "business",
  defaultLabel: "VISIT OUR SITE",
  render: (o) =>
    wrap(`
      <rect x="10" y="10" width="380" height="480" rx="12" fill="${o.bg}" stroke="${o.color}" stroke-width="1.5"/>
      <path d="M10 22 A12 12 0 0 1 22 10 H378 A12 12 0 0 1 390 22 V44 H10 Z" fill="${o.color}"/>
      <text x="200" y="34" text-anchor="middle" fill="${o.bg}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="12" font-weight="600" letter-spacing="6">SCAN TO CONNECT</text>
      ${qrSlot(o)}
      <text x="200" y="436" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="22" font-weight="600" letter-spacing="2">${escape(o.label)}</text>
    `),
};

const businessSignature: FrameDef = {
  id: "biz-signature",
  name: "Signature",
  category: "business",
  defaultLabel: "Book a call",
  render: (o) =>
    wrap(`
      <rect x="0" y="0" width="400" height="500" fill="${o.bg}"/>
      <rect x="24" y="24" width="352" height="452" rx="6" fill="none" stroke="${o.color}" stroke-width="1" opacity="0.4"/>
      ${qrSlot(o)}
      <path d="M120 398 Q160 380 200 398 T280 398" stroke="${o.color}" stroke-width="2" fill="none" opacity="0.7"/>
      <text x="200" y="444" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `Georgia, serif`}" font-size="24" font-style="italic">${escape(o.label)}</text>
    `),
};

const socialProfile: FrameDef = {
  id: "social-profile",
  name: "Profile",
  category: "social",
  defaultLabel: "@yourhandle",
  render: (o) =>
    wrap(`
      <rect x="10" y="10" width="380" height="480" rx="32" fill="${o.bg}" stroke="${o.color}" stroke-width="2"/>
      ${qrSlot(o)}
      <circle cx="200" cy="400" r="26" fill="none" stroke="${o.color}" stroke-width="2"/>
      <circle cx="200" cy="392" r="9" fill="${o.color}"/>
      <path d="M182 416 A22 22 0 0 1 218 416" fill="${o.color}"/>
      <text x="200" y="464" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="20" font-weight="600" letter-spacing="1">${escape(o.label)}</text>
    `),
};

const socialLinkHub: FrameDef = {
  id: "social-hub",
  name: "Link Hub",
  category: "social",
  defaultLabel: "ALL MY LINKS",
  render: (o) =>
    wrap(`
      <rect x="10" y="10" width="380" height="480" rx="26" fill="${o.bg}" stroke="${o.color}" stroke-width="1.5"/>
      ${qrSlot(o)}
      <rect x="70" y="386" width="260" height="26" rx="13" fill="${o.color}" opacity="0.15"/>
      <rect x="70" y="418" width="260" height="26" rx="13" fill="${o.color}" opacity="0.1"/>
      <text x="200" y="472" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="18" font-weight="700" letter-spacing="4">${escape(o.label)}</text>
    `),
};

const foodTable: FrameDef = {
  id: "food-table",
  name: "Table Tent",
  category: "food",
  defaultLabel: "ORDER AT TABLE",
  render: (o) =>
    wrap(`
      <path d="M20 490 L200 14 L380 490 Z" fill="${o.bg}" stroke="${o.color}" stroke-width="1.5"/>
      ${qrSlot(o)}
      <text x="200" y="432" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="20" font-weight="700" letter-spacing="3">${escape(o.label)}</text>
    `),
};

const eventVip: FrameDef = {
  id: "event-vip",
  name: "VIP Pass",
  category: "events",
  defaultLabel: "VIP ACCESS",
  render: (o) =>
    wrap(`
      <rect x="10" y="10" width="380" height="480" rx="18" fill="${o.bg}" stroke="${o.color}" stroke-width="2"/>
      <rect x="10" y="10" width="380" height="30" fill="${o.color}"/>
      <text x="200" y="31" text-anchor="middle" fill="${o.bg}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="12" font-weight="700" letter-spacing="8">ADMIT ONE</text>
      ${qrSlot(o)}
      <rect x="60" y="398" width="280" height="54" rx="8" fill="none" stroke="${o.color}" stroke-width="1.5"/>
      <text x="200" y="434" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="22" font-weight="700" letter-spacing="5">${escape(o.label)}</text>
    `),
};

const shoppingSale: FrameDef = {
  id: "shop-sale",
  name: "Sale Burst",
  category: "shopping",
  defaultLabel: "SHOP NOW",
  render: (o) =>
    wrap(`
      <rect x="10" y="10" width="380" height="480" rx="16" fill="${o.bg}" stroke="${o.color}" stroke-width="1.5"/>
      <circle cx="336" cy="60" r="34" fill="${o.color}" opacity="0.9"/>
      <text x="336" y="66" text-anchor="middle" fill="${o.bg}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="14" font-weight="700">SALE</text>
      ${qrSlot(o)}
      <text x="200" y="438" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="24" font-weight="700" letter-spacing="4">${escape(o.label)}</text>
    `),
};

// ─────────────── PROFESSIONAL GEOMETRIC (standard) ───────────────
// Simple shapes that never intrude on the QR modules; the CTA always sits in
// a padded band below the code so scannability is untouched.

const standardSoftBox: FrameDef = {
  id: "std-soft-box",
  name: "Rounded Rectangle",
  category: "standard",
  defaultLabel: "SCAN ME",
  render: (o) =>
    wrap(`
      <rect x="12" y="12" width="376" height="476" rx="34" fill="${o.bg}" stroke="${o.color}" stroke-width="2.5"/>
      ${qrSlot(o)}
      <text x="200" y="428" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="26" font-weight="600" letter-spacing="4">${escape(o.label)}</text>
    `),
};

const standardCircle: FrameDef = {
  id: "std-circle",
  name: "Elegant Circle",
  category: "standard",
  defaultLabel: "SCAN ME",
  render: (o) =>
    wrap(`
      <rect x="0" y="0" width="400" height="500" fill="${o.bg}"/>
      <circle cx="200" cy="200" r="186" fill="none" stroke="${o.color}" stroke-width="2.5"/>
      ${qrSlot(o)}
      <text x="200" y="440" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="26" font-weight="600" letter-spacing="4">${escape(o.label)}</text>
    `),
};

const standardMinimalCorners: FrameDef = {
  id: "std-min-corners",
  name: "Minimalist Corners",
  category: "standard",
  defaultLabel: "SCAN ME",
  render: (o) =>
    wrap(`
      <rect x="0" y="0" width="400" height="500" fill="${o.bg}"/>
      <path d="M24 76 V44 A20 20 0 0 1 44 24 H76" fill="none" stroke="${o.color}" stroke-width="4" stroke-linecap="round"/>
      <path d="M324 24 H356 A20 20 0 0 1 376 44 V76" fill="none" stroke="${o.color}" stroke-width="4" stroke-linecap="round"/>
      <path d="M24 324 V356 A20 20 0 0 0 44 376 H76" fill="none" stroke="${o.color}" stroke-width="4" stroke-linecap="round"/>
      <path d="M324 376 H356 A20 20 0 0 0 376 356 V324" fill="none" stroke="${o.color}" stroke-width="4" stroke-linecap="round"/>
      ${qrSlot(o)}
      <text x="200" y="440" text-anchor="middle" fill="${o.color}" font-family="${o.font ?? `ui-sans-serif, system-ui, sans-serif`}" font-size="26" font-weight="600" letter-spacing="4">${escape(o.label)}</text>
    `),
};

/** Fine-tuning axes applied on top of any frame's base geometry. */
export interface FrameTweaks {
  /** Multiplier on every stroke-width (0.5 – 3). */
  stroke: number;
  /** Multiplier on every corner radius (0 – 2). */
  radius: number;
  /** Vertical nudge in SVG units for label text (-24 – 24). */
  labelShift: number;
}

export const DEFAULT_FRAME_TWEAKS: FrameTweaks = { stroke: 1, radius: 1, labelShift: 0 };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Post-processes generated frame SVG so a single set of sliders can fine-tune
 * border thickness, corner radius and label padding across every frame.
 */
export function applyFrameTweaks(svg: string, tweaks?: Partial<FrameTweaks> | null): string {
  const t = { ...DEFAULT_FRAME_TWEAKS, ...(tweaks ?? {}) };
  if (t.stroke === 1 && t.radius === 1 && t.labelShift === 0) return svg;
  const stroke = clamp(t.stroke, 0.5, 3);
  const radius = clamp(t.radius, 0, 2);
  const shift = clamp(t.labelShift, -24, 24);

  let out = svg;
  if (stroke !== 1) {
    out = out.replace(
      /stroke-width="([\d.]+)"/g,
      (_m, w) => `stroke-width="${+(Number(w) * stroke).toFixed(2)}"`,
    );
  }
  if (radius !== 1) {
    out = out.replace(
      /\b(rx|ry)="([\d.]+)"/g,
      (_m, attr, r) => `${attr}="${+(Number(r) * radius).toFixed(2)}"`,
    );
  }
  if (shift !== 0) {
    out = out.replace(
      /(<text[^>]*\by=")([\d.]+)(")/g,
      (_m, pre, y, post) => `${pre}${+(Number(y) + shift).toFixed(2)}${post}`,
    );
  }
  return out;
}

export const FRAMES: FrameDef[] = [
  standardSoftBox,
  standardCircle,
  standardMinimalCorners,
  standardHairline,
  standardBracket,
  beautyOrganic,
  beautyEditorial,
  foodMenu,
  foodChef,
  entertainmentPlay,
  communityChat,
  eventTicket,
  shoppingTag,
  shoppingCart,
  paymentTerminal,
  paymentReceipt,
  wifiSignal,
  wifiGuest,
  businessCard,
  businessCorporate,
  travelBoarding,
  travelPassport,
  socialFollow,
  socialStory,
  standardDouble,
  standardBadge,
  standardTicketNotch,
  businessHeader,
  businessSignature,
  socialProfile,
  socialLinkHub,
  foodTable,
  eventVip,
  shoppingSale,
];

export const FRAME_CATEGORIES: { id: FrameCategory; label: string }[] = [
  { id: "standard", label: "Standard" },
  { id: "beauty", label: "Beauty" },
  { id: "food", label: "Food" },
  { id: "entertainment", label: "Entertainment" },
  { id: "community", label: "Community" },
  { id: "events", label: "Events" },
  { id: "shopping", label: "Shopping" },
  { id: "payment", label: "Payment" },
  { id: "wifi", label: "Wi-Fi" },
  { id: "business", label: "Business" },
  { id: "travel", label: "Travel" },
  { id: "social", label: "Social" },
  { id: "all", label: "All" },
];

export const findFrame = (id: string | null | undefined): FrameDef | null =>
  (id && FRAMES.find((f) => f.id === id)) || null;
