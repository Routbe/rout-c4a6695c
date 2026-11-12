/**
 * Extra footerstijlen (bovenop de 12 basisstijlen in profile-design.ts),
 * zodat er in totaal 50 keuzes zijn. Elke stijl is pure CSS op basis van de
 * accentkleur en het thema — geen afbeeldingen, geen scripts.
 */
type Theme = { border: string; card: string; muted: string };
type Css = Record<string, string | number>;

const mix = (c: string, pct: number) => `color-mix(in oklab, ${c} ${pct}%, transparent)`;

export const EXTRA_FOOTER_STYLES = [
  { id: "double", label: "Dubbele lijn", hint: "Twee fijne lijnen", css: (a: string) => ({ borderTop: `3px double ${a}`, paddingTop: 16, width: "100%" }) },
  { id: "thick", label: "Dikke lijn", hint: "Stevige balk boven", css: (a: string) => ({ borderTop: `4px solid ${a}`, paddingTop: 16, width: "100%" }) },
  { id: "dashed", label: "Streepjes", hint: "Gestreepte lijn", css: (a: string) => ({ borderTop: `2px dashed ${a}`, paddingTop: 16, width: "100%" }) },
  { id: "underline", label: "Onderstreept", hint: "Lijn onder de tekst", css: (a: string) => ({ borderBottom: `2px solid ${a}`, paddingBottom: 8 }) },
  { id: "bracket", label: "Haakjes", hint: "Rand links en rechts", css: (a: string) => ({ borderLeft: `2px solid ${a}`, borderRight: `2px solid ${a}`, padding: "4px 18px" }) },
  { id: "leftbar", label: "Zijbalk", hint: "Accent links", css: (a: string) => ({ borderLeft: `4px solid ${a}`, padding: "6px 14px", textAlign: "left" }) },
  { id: "pill", label: "Pil", hint: "Afgeronde capsule", css: (a: string, t: Theme) => ({ background: t.card, border: `1px solid ${a}`, borderRadius: 999, padding: "8px 20px" }) },
  { id: "pillsolid", label: "Volle pil", hint: "Gevulde capsule", css: (a: string) => ({ background: mix(a, 35), borderRadius: 999, padding: "8px 20px" }) },
  { id: "square", label: "Vierkant kader", hint: "Strakke hoeken", css: (a: string) => ({ border: `1px solid ${a}`, padding: "10px 18px" }) },
  { id: "shadowcard", label: "Zwevend kaartje", hint: "Zachte schaduw", css: (_a: string, t: Theme) => ({ background: t.card, borderRadius: 16, padding: "12px 18px", boxShadow: "0 12px 30px -14px rgb(0 0 0 / 0.45)" }) },
  { id: "offset", label: "Retro schaduw", hint: "Harde verschoven schaduw", css: (a: string, t: Theme) => ({ background: t.card, border: `2px solid ${a}`, padding: "10px 18px", boxShadow: `5px 5px 0 ${a}` }) },
  { id: "glass", label: "Glas", hint: "Matglas-effect", css: (a: string) => ({ background: mix(a, 12), backdropFilter: "blur(10px)", border: `1px solid ${mix(a, 40)}`, borderRadius: 18, padding: "12px 18px" }) },
  { id: "inset", label: "Ingezonken", hint: "Binnenschaduw", css: (_a: string, t: Theme) => ({ background: t.card, borderRadius: 14, padding: "12px 18px", boxShadow: "inset 0 2px 8px rgb(0 0 0 / 0.35)" }) },
  { id: "halo", label: "Halo", hint: "Ring met gloed", css: (a: string) => ({ borderRadius: 999, padding: "10px 22px", boxShadow: `0 0 0 2px ${a}, 0 0 40px -6px ${a}` }) },
  { id: "spotlight", label: "Spotlicht", hint: "Licht van onderen", css: (a: string) => ({ width: "100%", paddingTop: 20, backgroundImage: `radial-gradient(ellipse at bottom, ${mix(a, 40)}, transparent 70%)` }) },
  { id: "sunrise", label: "Zonsopgang", hint: "Warm verloop", css: () => ({ width: "100%", padding: "18px 0", borderRadius: 20, backgroundImage: "linear-gradient(180deg, transparent, color-mix(in oklab, #f59e0b 30%, transparent))" }) },
  { id: "ocean", label: "Oceaan", hint: "Koel verloop", css: () => ({ width: "100%", padding: "18px 0", borderRadius: 20, backgroundImage: "linear-gradient(180deg, transparent, color-mix(in oklab, #0ea5e9 30%, transparent))" }) },
  { id: "forest", label: "Bos", hint: "Groen verloop", css: () => ({ width: "100%", padding: "18px 0", borderRadius: 20, backgroundImage: "linear-gradient(180deg, transparent, color-mix(in oklab, #16a34a 30%, transparent))" }) },
  { id: "rainbow", label: "Regenboog", hint: "Kleurrijke lijn", css: () => ({ width: "100%", paddingTop: 16, borderTop: "3px solid transparent", borderImage: "linear-gradient(90deg,#ef4444,#f59e0b,#22c55e,#3b82f6,#a855f7) 1" }) },
  { id: "fade", label: "Vervagende lijn", hint: "Lijn die uitloopt", css: (a: string) => ({ width: "100%", paddingTop: 16, borderTop: "1px solid transparent", borderImage: `linear-gradient(90deg, transparent, ${a}, transparent) 1` }) },
  { id: "stripes", label: "Strepen", hint: "Diagonale strepen", css: (a: string) => ({ width: "100%", padding: "12px 0", borderRadius: 12, backgroundImage: `repeating-linear-gradient(45deg, ${mix(a, 18)} 0 8px, transparent 8px 16px)` }) },
  { id: "dots", label: "Stippen", hint: "Stippenpatroon", css: (a: string) => ({ width: "100%", padding: "12px 0", borderRadius: 12, backgroundImage: `radial-gradient(${mix(a, 45)} 1.2px, transparent 1.4px)`, backgroundSize: "10px 10px" }) },
  { id: "grid", label: "Raster", hint: "Ruitjespapier", css: (a: string) => ({ width: "100%", padding: "12px 0", borderRadius: 12, backgroundImage: `linear-gradient(${mix(a, 20)} 1px, transparent 1px), linear-gradient(90deg, ${mix(a, 20)} 1px, transparent 1px)`, backgroundSize: "12px 12px" }) },
  { id: "checker", label: "Dambord", hint: "Klein dambord", css: (a: string) => ({ width: "100%", padding: "12px 0", borderRadius: 12, backgroundImage: `conic-gradient(${mix(a, 18)} 25%, transparent 0 50%, ${mix(a, 18)} 0 75%, transparent 0)`, backgroundSize: "14px 14px" }) },
  { id: "zigzag", label: "Zigzag", hint: "Getande rand", css: (a: string) => ({ width: "100%", paddingTop: 18, backgroundImage: `linear-gradient(135deg, ${a} 25%, transparent 25%), linear-gradient(225deg, ${a} 25%, transparent 25%)`, backgroundSize: "12px 12px", backgroundRepeat: "repeat-x", backgroundPosition: "top" }) },
  { id: "ribbon", label: "Lint", hint: "Gekleurd lint", css: (a: string) => ({ background: a, color: "white", padding: "8px 26px", clipPath: "polygon(0 0,100% 0,96% 50%,100% 100%,0 100%,4% 50%)" }) },
  { id: "label", label: "Etiket", hint: "Label met hoek", css: (a: string, t: Theme) => ({ background: t.card, border: `1px solid ${a}`, padding: "8px 22px", clipPath: "polygon(8% 0,100% 0,100% 100%,8% 100%,0 50%)" }) },
  { id: "ticket", label: "Ticket", hint: "Toegangskaartje", css: (a: string) => ({ border: `2px dashed ${a}`, borderRadius: 14, padding: "10px 22px", background: mix(a, 10) }) },
  { id: "polaroid", label: "Polaroid", hint: "Witte rand", css: () => ({ background: "white", color: "#222", padding: "10px 18px 18px", boxShadow: "0 8px 20px -10px rgb(0 0 0 / 0.5)", transform: "rotate(1deg)" }) },
  { id: "note", label: "Notitie", hint: "Geel briefje", css: () => ({ background: "#fde68a", color: "#422006", padding: "12px 18px", transform: "rotate(-1deg)", boxShadow: "0 6px 14px -8px rgb(0 0 0 / 0.5)" }) },
  { id: "chalk", label: "Krijtbord", hint: "Donker bord", css: () => ({ background: "#1f2a24", color: "#e7efe9", border: "6px solid #6b4f2a", borderRadius: 6, padding: "10px 18px" }) },
  { id: "terminal", label: "Terminal", hint: "Groene code", css: () => ({ background: "#0b0f0b", color: "#4ade80", fontFamily: "ui-monospace, monospace", borderRadius: 8, padding: "10px 16px" }) },
  { id: "mono", label: "Typemachine", hint: "Vaste letterbreedte", css: (a: string) => ({ fontFamily: "ui-monospace, monospace", borderTop: `1px solid ${a}`, paddingTop: 14, width: "100%" }) },
  { id: "serif", label: "Klassiek", hint: "Schreefletter", css: (a: string) => ({ fontFamily: "Georgia, serif", fontStyle: "italic", borderTop: `1px solid ${a}`, paddingTop: 14, width: "100%" }) },
  { id: "spaced", label: "Ruim gespatieerd", hint: "Brede letters", css: () => ({ textTransform: "uppercase", letterSpacing: "0.32em", fontSize: 10 }) },
  { id: "tiny", label: "Fijn", hint: "Kleine discrete tekst", css: () => ({ fontSize: 10, opacity: 0.7 }) },
  { id: "bold", label: "Vet", hint: "Opvallende tekst", css: () => ({ fontWeight: 700, fontSize: 14 }) },
  { id: "neonbox", label: "Neonkader", hint: "Oplichtend kader", css: (a: string) => ({ border: `1px solid ${a}`, borderRadius: 10, padding: "10px 18px", boxShadow: `0 0 12px ${a}, inset 0 0 12px ${mix(a, 50)}` }) },
] as const satisfies ReadonlyArray<{ id: string; label: string; hint: string; css: (a: string, t: Theme) => Css }>;

export type ExtraFooterStyle = (typeof EXTRA_FOOTER_STYLES)[number]["id"];

export function extraFooterCss(id: string, accent: string, theme: Theme): Css | null {
  const found = EXTRA_FOOTER_STYLES.find((s) => s.id === id);
  return found ? (found.css as (a: string, t: Theme) => Css)(accent, theme) : null;
}
