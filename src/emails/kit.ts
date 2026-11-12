/**
 * ROUT mail kit — one clean design for every e-mail the site sends.
 *
 * Pure string builders (sync, no React) so both server functions and the
 * notification renderer can use them. Every dynamic value passes through
 * `esc()`; callers never hand raw user input to `raw`.
 *
 * Design: white page, centred 520px card, ROUT wordmark, one heading, short
 * copy, optional detail table, one primary button (or approve/reject pair),
 * quiet footer. Mail clients ignore CSS variables, so colours are inline.
 */

import * as D from "./design/layout";
import { esc, type Accent } from "./design/layout";
import { copyFor, type CopyPack } from "./design/copy";

type DeskKey = keyof CopyPack["desks"];

export const KIT = {
  page: "#f5f4f2",
  card: "#ffffff",
  border: "#e7e4df",
  text: "#151413",
  muted: "#6b665f",
  ink: "#0b0b0c",
  mint: "#1f9e6a",
  mintBg: "#e8f7ef",
  pink: "#db2777",
  pinkBg: "#fdeef6",
  amber: "#b45309",
  amberBg: "#fdf3e3",
  red: "#c0362c",
  redBg: "#fcebea",
  blue: "#1d6fd8",
  blueBg: "#e8f1fc",
} as const;

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "creator" | "business";

const TONE_ACCENT: Record<Tone, Accent> = {
  neutral: "neutral",
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
  creator: "creator",
  business: "ink",
};

export { esc };

/** Only http(s) links ever reach an href. */
export function safeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? esc(url) : "#";
}

/**
 * Status label. Rendered as the coloured badge in the mail header by
 * `layout()`; the marker carries tone + escaped label.
 */
export const pill = (label: string, tone: Tone = "neutral") => `<!--rout-badge:${tone}:${esc(label).toUpperCase()}-->`;

export const heading = (text: string) => D.h1(esc(text));
export const paragraph = (text: string) => D.p(esc(text));
export const note = (text: string) => D.notice(esc(text));
export const quote = (text: string) => D.quote("", esc(text));
export const code = (value: string) => D.codeBox("", esc(value));

export function details(rows: Array<[string, unknown]>): string {
  const kept = rows.filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "");
  return D.box("", kept.map(([k, v]) => [esc(k), esc(v)] as [string, string]));
}

type BtnStyle = "primary" | "approve" | "reject" | "ghost";

export const button = (label: string, url: string, style: BtnStyle = "primary") => D.buttonLink(esc(label), safeUrl(url), style);

/** One or more buttons side by side (wrap on narrow screens). */
export const actions = (...buttons: string[]) => D.buttons(...buttons);

export const linkFallback = (label: string, url: string) => D.urlBox(esc(label), safeUrl(url));

/** Full document in the shared ROUT design. `blocks` are already-escaped kit fragments. */
export function layout(opts: { lang?: string; preview: string; blocks: string[]; footer?: string; desk?: DeskKey }): string {
  const lang = (opts.lang ?? "nl").slice(0, 2).toLowerCase();
  const c = copyFor(lang);
  let badge = "ROUT DESK";
  let accent: Accent = "neutral";
  const blocks: string[] = [];
  for (const b of opts.blocks) {
    const m = /^<!--rout-badge:(\w+):(.*)-->$/.exec(b);
    if (m) {
      if (badge === "ROUT DESK") {
        accent = TONE_ACCENT[m[1] as Tone] ?? "neutral";
        badge = m[2] ?? badge;
      }
      continue;
    }
    blocks.push(b);
  }
  if (opts.footer) blocks.push(D.notice(esc(opts.footer)));
  const title = /<h1[^>]*>(.*?)<\/h1>/.exec(blocks.join(""))?.[1] ?? "ROUT";
  return D.shell({ lang, title, preheader: esc(opts.preview), badge, accent, desk: c.desks[opts.desk ?? "desk"], body: blocks });
}
