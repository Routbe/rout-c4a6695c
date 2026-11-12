/**
 * ROUT mail design — the single source of truth for how every e-mail looks.
 *
 * Mirrors the approved Brevo reference templates: light card on #f6f6f4,
 * monospace type, bunny logo + "Sovereign Infrastructure", a coloured status
 * badge, a signature "desk" block and the shared social/legal footer.
 *
 * Block helpers take already-safe strings: callers escape user input with
 * `esc()` (inline mails) or pass Brevo `{{ params.X }}` placeholders (synced
 * templates). Table-based and inline-styled so Outlook/Gmail render it.
 */

export const MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";

export const ACCENT = {
  auth: "#3b82f6",
  success: "#10b981",
  paid: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
  neutral: "#888888",
  info: "#3b82f6",
  creator: "#db2777",
  ink: "#111111",
} as const;
export type Accent = keyof typeof ACCENT;

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Dogfooding: one first-party badge instead of external social icons (spam triggers). PNG — mail clients strip SVG/<picture>. */
export const ROUT_BADGE_HTML =
  `<a href="https://rout.be/rout.be" target="_blank" style="text-decoration: none;"><img src="https://rout.be/img/verified-on-rout.png" width="160" height="34" alt="Verified on ROUT" style="display: block; border: 0; width: 160px; height: 34px;"></a>`;

/** Gmail ViewAction schema; only for real https action links. */
export function viewActionJsonLd(url: string, name: string, description: string): string {
  if (!/^https:\/\//i.test(url)) return "";
  const json = JSON.stringify({
    "@context": "http://schema.org",
    "@type": "EmailMessage",
    potentialAction: { "@type": "ViewAction", url, name },
    description,
  }).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
}

/** Functional security disclaimer under the badge (balances text-to-link ratio). */
export const securityDisclaimer = (email: string) =>
  `<div style="margin-top: 14px; font-size: 10px; line-height: 1.5; color: #9ca3af;">Deze transactionele beveiligingsmail is verzonden naar ${email} wegens een inlogpoging op rout.be. Als jij dit niet was, kun je dit veilig negeren. ROUT is een soevereine infrastructuur, gehost in Europa.</div>`;

const FOOTER_TEXT: Record<string, { privacy: string; terms: string; by: string }> = {
  nl: { privacy: "Privacy", terms: "Voorwaarden", by: "Ontworpen &amp; gebouwd door" },
  en: { privacy: "Privacy", terms: "Terms", by: "Designed &amp; engineered by" },
  fr: { privacy: "Confidentialité", terms: "Conditions", by: "Conçu &amp; développé par" },
  de: { privacy: "Datenschutz", terms: "AGB", by: "Gestaltet &amp; entwickelt von" },
  es: { privacy: "Privacidad", terms: "Términos", by: "Diseñado y desarrollado por" },
  it: { privacy: "Privacy", terms: "Termini", by: "Progettato e sviluppato da" },
  pt: { privacy: "Privacidade", terms: "Termos", by: "Concebido e desenvolvido por" },
  pl: { privacy: "Prywatność", terms: "Regulamin", by: "Zaprojektowane i zbudowane przez" },
  zh: { privacy: "隐私", terms: "条款", by: "设计与开发：" },
};

// ---------- blocks ----------

export const h1 = (text: string) =>
  `<h1 style="margin: 0 0 12px 0; font-size: 20px; line-height: 28px; font-weight: 700; color: #111111; font-family: ${MONO};">${text}</h1>`;

export const greeting = (text: string) =>
  `<p style="margin: 0 0 16px 0; color: #222222; font-size: 14px; line-height: 22px;">${text}</p>`;

export const p = (text: string) =>
  `<p style="margin: 0 0 20px 0; color: #444444; font-size: 14px; line-height: 22px;">${text}</p>`;

export const notice = (text: string) =>
  `<p style="margin: 0 0 16px 0; color: #777777; font-size: 12px; line-height: 18px;">${text}</p>`;

const label = (text: string, mb = 10) =>
  `<div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #888888; margin-bottom: ${mb}px;">${text}</div>`;

/** Overview box: title + label/value rows. Rows with an empty value are dropped. */
export function box(title: string, rows: Array<[string, string]>): string {
  const body = rows
    .filter(([, v]) => v !== "")
    .map(
      ([k, v], i) =>
        `<tr><td style="padding: 4px 0; color: #666666; vertical-align: top;">${k}</td>` +
        `<td align="right" style="padding: 4px 0 4px 12px; font-weight: ${i === 0 ? 700 : 600}; color: #111111; word-break: break-word;">${v}</td></tr>`,
    )
    .join("");
  if (!body) return "";
  return `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #fafafa; border: 1px solid #eaeaea; border-radius: 10px; margin: 0 0 24px 0;"><tr><td style="padding: 18px 20px; font-size: 13px; line-height: 22px; color: #444444; font-family: ${MONO};">${label(title)}<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">${body}</table></td></tr></table>`;
}

/** Quoted free text (a submitted message, a rejection reason). */
export const quote = (title: string, text: string) =>
  `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #fafafa; border: 1px solid #eaeaea; border-radius: 10px; margin: 0 0 24px 0;"><tr><td style="padding: 18px 20px; font-size: 13px; line-height: 21px; color: #333333; font-family: ${MONO}; white-space: pre-wrap; word-break: break-word;">${title ? label(title) : ""}${text}</td></tr></table>`;

export const codeBox = (title: string, value: string) =>
  `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #fafafa; border: 1px solid #eaeaea; border-radius: 12px; margin: 0 0 24px 0; text-align: center;"><tr><td style="padding: 20px 16px;">${label(title, 8)}<div style="font-family: ${MONO}; font-size: 32px; font-weight: 700; letter-spacing: 0.25em; color: #111111; padding-left: 0.25em;">${value}</div></td></tr></table>`;

export type ButtonStyle = "primary" | "approve" | "reject" | "ghost";
const BTN: Record<ButtonStyle, string> = {
  primary: "background-color: #111111; color: #ffffff; border: 1px solid #111111;",
  approve: "background-color: #10b981; color: #ffffff; border: 1px solid #10b981;",
  reject: "background-color: #ffffff; color: #ef4444; border: 1px solid #ef4444;",
  ghost: "background-color: #ffffff; color: #111111; border: 1px solid #e6e6e1;",
};

export const buttonLink = (text: string, href: string, style: ButtonStyle = "primary") =>
  `<a href="${href}" target="_blank" style="display: inline-block; ${BTN[style]} text-decoration: none; padding: 13px 26px; border-radius: 10px; font-size: 14px; font-weight: 600; font-family: ${MONO}; letter-spacing: -0.01em;">${text}</a>`;

/** One or more buttons, centred. */
export const buttons = (...links: string[]) =>
  `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;"><tr><td align="center">${links
    .map((l) => `<span style="display: inline-block; margin: 0 4px 8px 4px;">${l}</span>`)
    .join("")}</td></tr></table>`;

export const button = (text: string, href: string, style: ButtonStyle = "primary") => buttons(buttonLink(text, href, style));

export const urlBox = (title: string, url: string) =>
  `${label(title, 6)}<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border: 1px solid #eaeaea; border-radius: 8px; margin-bottom: 20px;"><tr><td style="padding: 10px 14px; font-size: 11px; line-height: 16px; color: #666666; word-break: break-all; font-family: ${MONO};">${url}</td></tr></table>`;

// ---------- document ----------

export interface ShellOptions {
  lang: string;
  title: string;
  preheader: string;
  badge: string;
  accent: Accent;
  desk: { name: string; role: string };
  body: string[];
  /** Auth mails: Gmail ViewAction target (magic link). */
  actionUrl?: string;
  /** Auth mails: escaped recipient (or Brevo placeholder) for the disclaimer. */
  recipient?: string;
}

export function shell(o: ShellOptions): string {
  const f = FOOTER_TEXT[o.lang] ?? FOOTER_TEXT.en!;
  const color = ACCENT[o.accent] ?? ACCENT.neutral;
  const jsonLd = o.actionUrl ? viewActionJsonLd(o.actionUrl, "Inloggen bij ROUT", "Eenmalige inlogcode voor ROUT") : "";
  const year = new Date().getUTCFullYear();
  return `<!DOCTYPE html>
<html lang="${esc(o.lang)}" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${o.title} — ROUT</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
${jsonLd}
<style type="text/css">
:root { color-scheme: light dark; supported-color-schemes: light dark; }
body { margin: 0 !important; padding: 0 !important; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
@media (prefers-color-scheme: dark) {
  body, .rout-bg { background-color: #0d0d0c !important; }
  .rout-card { background-color: #161615 !important; border-color: #2a2a28 !important; }
  .rout-card td, .rout-card div, .rout-card p, .rout-card span, .rout-card strong { color: #ececea !important; border-color: #2a2a28 !important; }
  .rout-card a { color: #ffffff !important; }
  .rout-foot { background-color: #121211 !important; }
  .rout-card table[style*="#fafafa"], .rout-card table[style*="#ffffff"] { background-color: #1e1e1c !important; border-color: #2a2a28 !important; }
  .rout-logo { filter: invert(1); }
}
[data-ogsc] .rout-card { background-color: #161615 !important; }
@media only screen and (max-width: 600px) { .rout-card { border-radius: 12px !important; } .rout-padding { padding: 24px 18px !important; } }
</style>
</head>
<body style="margin: 0; padding: 0; background-color: #f6f6f4; -webkit-font-smoothing: antialiased;">
<div style="display: none; max-height: 0px; overflow: hidden; opacity: 0; font-size: 1px; line-height: 1px; color: #ffffff; mso-hide: all;">${o.preheader} ${"&#847; ".repeat(15)}</div>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="rout-bg" style="background-color: #f6f6f4; font-family: ${MONO};">
<tr><td align="center" style="padding: 40px 16px;">
<!--[if mso]><table role="presentation" align="center" width="520" border="0" cellspacing="0" cellpadding="0"><tr><td><![endif]-->
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="rout-card" style="max-width: 520px; background-color: #ffffff; border: 1px solid #e6e6e1; border-radius: 20px; overflow: hidden;">
<tr><td class="rout-padding" style="padding: 28px 28px 20px 28px; border-bottom: 1px solid #f0f0ec;">
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"><tr>
<td valign="top" width="42"><a href="https://rout.be" target="_blank" style="text-decoration: none;"><img src="https://rout.be/img/rout-bunny.png" width="34" height="34" alt="ROUT" class="rout-logo" style="display: block; border: 0;"></a></td>
<td valign="top"><div style="font-weight: 600; font-size: 16px; line-height: 1.2; letter-spacing: 0.14em; color: #111111; font-family: ${MONO};">ROUT</div><div style="font-size: 12px; color: #777777; margin-top: 3px; font-family: ${MONO};">Sovereign Infrastructure</div></td>
<td valign="top" align="right" style="font-weight: 500; font-size: 11px; line-height: 1.2; color: ${color}; letter-spacing: 0.05em; font-family: ${MONO};"><span style="font-size: 12px;">•</span> ${o.badge}</td>
</tr></table>
</td></tr>
<tr><td class="rout-padding" style="padding: 28px 28px 24px 28px; font-size: 14px; line-height: 22px; color: #222222; font-family: ${MONO};">
${o.body.join("\n")}
<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin-top: 20px;"><tr><td style="border-left: 3px solid #111111; padding-left: 14px; font-family: ${MONO};"><div style="font-weight: 700; font-size: 14px; color: #111111;">${o.desk.name}</div><div style="font-size: 12px; color: #666666; margin-top: 2px;">${o.desk.role}</div></td></tr></table>
</td></tr>
<tr><td class="rout-padding rout-foot" style="padding: 20px 28px 28px 28px; background-color: #fafafa; border-top: 1px solid #f0f0ec; font-family: ${MONO};">
<div style="margin-bottom: 20px;">${ROUT_BADGE_HTML}</div>
<div style="font-size: 12px; line-height: 1.6; color: #666666; margin-bottom: 16px;"><a href="https://rout.be" target="_blank" style="color: #111111; text-decoration: none;">rout.be</a> <span style="color: #cccccc; margin: 0 8px;">·</span> <a href="https://rout.be/privacy" target="_blank" style="color: #666666; text-decoration: none;">${f.privacy}</a> <span style="color: #cccccc; margin: 0 8px;">·</span> <a href="https://rout.be/terms" target="_blank" style="color: #666666; text-decoration: none;">${f.terms}</a> <span style="color: #cccccc; margin: 0 8px;">·</span> <a href="https://rout.be/manifesto" target="_blank" style="color: #666666; text-decoration: none;">Manifesto</a></div>
<div style="border-top: 1px solid #eeeeea; padding-top: 14px; font-size: 11px; line-height: 1.6; color: #888888;"><div>© ${year} ROUT <span style="color: #cccccc;">·</span> Open Source (AGPLv3)</div><div style="margin-top: 2px; color: #777777;">${f.by} <a href="https://delplanche.cloud" target="_blank" style="color: #111111; text-decoration: underline; font-weight: 600;">Delplanche</a></div></div>
${o.recipient ? securityDisclaimer(o.recipient) : ""}
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body>
</html>`;
}
