/**
 * Design tokens an agent may put in a vault config (`config.canvas`), plus the
 * rules the API enforces. Pure and shared: the same schema feeds validation,
 * diagnostics and the public `/ai-manifest.json` (design_token_ast).
 */
import { z } from "zod";
import { contrastRatio, toHex, toRgb } from "@/lib/wcag";
import type { AgentDiagnostic } from "@/lib/agent/diagnostics";

export const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
/** Message marker the diagnostics engine uses to propose a normalised colour. */
export const HEX_COLOR_MESSAGE = "hex_color: use #RRGGBB";

const hex = z.string().regex(HEX_COLOR_RE, HEX_COLOR_MESSAGE);

export const TYPOGRAPHY_FAMILIES = ["sans", "serif", "mono"] as const;
export const RADIUS_TOKENS = ["none", "sm", "md", "lg", "full"] as const;

export const designCanvasSchema = z.strictObject({
  theme: z.strictObject({
    background: hex,
    text: hex,
    accent: hex.optional(),
    card: hex.optional(),
  }),
  typography: z
    .strictObject({
      family: z.enum(TYPOGRAPHY_FAMILIES),
      scale: z.number().min(0.8).max(1.4).optional(),
    })
    .optional(),
  radius: z.enum(RADIUS_TOKENS).optional(),
});
export type DesignCanvas = z.infer<typeof designCanvasSchema>;

/** Contrast rules (WCAG 2.1). `fix` names the token the suggestion changes. */
export const CONTRAST_RULES = [
  { id: "text_on_background", fg: "text", bg: "background", min: 4.5, fix: "text" },
  { id: "text_on_card", fg: "text", bg: "card", min: 4.5, fix: "text" },
  { id: "accent_on_background", fg: "accent", bg: "background", min: 3, fix: "accent" },
] as const;

/** Every key the design tokens know, for "did you mean" suggestions. */
export const DESIGN_TOKEN_KEYS = ["canvas", "theme", "background", "text", "accent", "card", "typography", "family", "scale", "radius"] as const;
const ALIASES: Record<string, string> = {
  bg: "background", backgroundcolor: "background", background_color: "background",
  color: "text", foreground: "text", fg: "text", textcolor: "text", text_color: "text",
  primary: "accent", brand: "accent", highlight: "accent",
  surface: "card", panel: "card",
  font: "family", fontfamily: "family", font_family: "family",
  fonts: "typography", type: "typography",
  borderradius: "radius", border_radius: "radius", corners: "radius",
};

function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Closest known token key for an unknown field, or null. */
export function suggestTokenKey(key: string): string | null {
  const k = key.toLowerCase().replace(/-/g, "_");
  if (ALIASES[k] ?? ALIASES[k.replace(/_/g, "")]) return ALIASES[k] ?? ALIASES[k.replace(/_/g, "")];
  let best: string | null = null;
  let bestD = 3;
  for (const known of DESIGN_TOKEN_KEYS) {
    const dist = editDistance(k, known);
    if (dist < bestD) [best, bestD] = [known, dist];
  }
  return best;
}

const NAMED: Record<string, string> = { white: "#FFFFFF", black: "#000000", red: "#FF0000", green: "#008000", blue: "#0000FF", gray: "#808080", grey: "#808080" };

/** Best-effort repair: "abc", "#abc", "aabbcc", "#AABBCCDD", "white", "rgb(1,2,3)" → "#RRGGBB". */
export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (NAMED[v]) return NAMED[v];
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(v);
  if (rgb) return `#${rgb.slice(1, 4).map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1].slice(0, 6);
  return `#${h.toUpperCase()}`;
}

/** Safe default per token when a colour cannot be repaired. */
export function fallbackColor(tokenKey: string): string {
  return tokenKey === "background" ? "#FFFFFF" : tokenKey === "card" ? "#F5F5F5" : tokenKey === "accent" ? "#1D4ED8" : "#111111";
}

/** Smallest mix of `fg` toward black or white (whichever contrasts more with `bg`) that reaches `min`. */
export function foregroundFix(fg: string, bg: string, min: number): string {
  const ink = contrastRatio("#000000", bg) >= contrastRatio("#FFFFFF", bg) ? [0, 0, 0] : [255, 255, 255];
  const from = toRgb(fg);
  for (let i = 1; i <= 20; i++) {
    const t = i / 20;
    const candidate = toHex(from.map((c, k) => c + (ink[k] - c) * t) as [number, number, number]);
    if (contrastRatio(candidate, bg) >= min) return candidate;
  }
  return toHex(ink as [number, number, number]);
}

/**
 * Semantic checks after the schema passed. `basePath` is where the canvas sits
 * in the request body (e.g. ["config", "canvas"]).
 */
export function designDiagnostics(canvas: DesignCanvas | undefined, basePath: string[]): AgentDiagnostic[] {
  if (!canvas) return [];
  const out: AgentDiagnostic[] = [];
  const theme = canvas.theme as Record<string, string | undefined>;
  for (const rule of CONTRAST_RULES) {
    const fg = theme[rule.fg];
    const bg = theme[rule.bg];
    if (!fg || !bg) continue;
    const ratio = contrastRatio(fg, bg);
    if (ratio >= rule.min) continue;
    // Only the foreground token moves: the background is the anchor, so fixes
    // for several rules never fight each other in an agent's retry loop.
    const suggestion = foregroundFix(fg, bg, rule.min);
    const target = rule.fix;
    const path = [...basePath, "theme", target];
    out.push({
      error_code: "insufficient_contrast",
      path: path.join("."),
      rejected_value: theme[target],
      message: `${rule.fg} ${fg} on ${rule.bg} ${bg} has contrast ${ratio.toFixed(2)}:1; at least ${rule.min}:1 is required (${rule.id}).`,
      suggested_mutation: { op: "replace", path: "/" + path.join("/"), value: suggestion },
    });
  }
  return out;
}
