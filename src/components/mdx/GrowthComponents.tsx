import { useState, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Minus, ShieldCheck, ArrowRight, AlertTriangle, X } from "lucide-react";
import { ROLE_LABELS, canAssignRole, canEditWorkspaceHub, canManageTeam, canUseDeveloperTools, checkWorkspaceDelete, type WorkspaceRole } from "@/lib/workspace-rules";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { mmToPx } from "@/components/DPISelector";
import { Link } from "@/lib/router-compat";
import { docs, DOC_LABELS, type DocCategory } from "@/lib/docs-catalog";
export function FAQ({ items }: { items: { question: string; answer: string }[] }) {
  return <Accordion type="single" collapsible>{items.map((item, index) => <AccordionItem value={String(index)} key={item.question}><AccordionTrigger>{item.question}</AccordionTrigger><AccordionContent>{item.answer}</AccordionContent></AccordionItem>)}</Accordion>;
}
export function QRPreview({ type = "url" }: { type?: string }) {
  const value = type === "wifi" ? "WIFI:T:WPA;S:ROUT Guest;P:voorbeeld-wachtwoord;;" : "https://rout.be/qr-code-generator";
  return <figure className="my-8 flex flex-wrap items-center justify-center gap-8 border-y border-border py-8"><QRCodeSVG value={value} size={176} marginSize={4} title={`Voorbeeld ${type} QR-code`} /><figcaption className="max-w-64 text-sm text-muted-foreground">{type === "wifi" ? "Voorbeeldnetwerk: ROUT Guest. De code bevat de netwerkgegevens." : "Voorbeeldcode naar de ROUT QR-gids; geen echte betaalopdracht."}</figcaption></figure>;
}
export function OnboardingSteps({ steps = [{ title: "Identiteit", text: "Geef de omgeving een naam." }, { title: "Adres", text: "Kies een herkenbaar workspace-adres." }, { title: "Categorie", text: "Kies het soort organisatie." }, { title: "Team", text: "Nodig collega’s uit met passende rechten." }, { title: "Plan", text: "Kies een plan en betaalperiode; selectie is geen betaalbewijs." }] }: { steps?: { title: string; text: string }[] }) {
 return <ol className="my-8 space-y-0">{steps.map((s, i) => <li id={`stap-${i + 1}`} key={s.title} className="relative flex gap-4 border-l border-border pb-7 pl-5"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-xs">{i + 1}</span><div><strong>{s.title}</strong><p className="mt-1 text-sm text-muted-foreground">{s.text}</p></div></li>)}</ol>;
}
export type ComparisonRow = { feature: string; rout: string | boolean; other: string | boolean };
export function CompareTable({ rows = [{ feature: "Broncode beschikbaar", rout: "AGPLv3", other: "Controleer de licentie van de aanbieder" }, { feature: "Eigen domeinen", rout: "Afhankelijk van actief plan en DNS-verificatie", other: "Controleer actuele voorwaarden" }], other = "Andere aanbieder" }: { rows?: ComparisonRow[]; other?: string }) {
 const cell = (v: string | boolean) => typeof v === "boolean" ? v ? <Check className="size-4 text-docs-link" aria-label="Ja" /> : <Minus className="size-4 text-destructive" aria-label="Nee" /> : v;
 return <div className="my-6 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-3">Kenmerk</th><th className="p-3">ROUT</th><th className="p-3">{other}</th></tr></thead><tbody>{rows.map(row => <tr className="border-t border-border" key={row.feature}><th className="p-3 font-medium">{row.feature}</th><td className="p-3">{cell(row.rout)}</td><td className="p-3">{cell(row.other)}</td></tr>)}</tbody></table></div>;
}
/** Rows come from the same rules the server enforces (workspace-rules.ts), so the table cannot drift from the app. */
type MatrixCell = boolean | string;
const MATRIX_ROLES = ["owner", "admin", "developer", "editor", "viewer"] as const satisfies readonly WorkspaceRole[];
const MATRIX_ROWS: { title: string; note?: string; cell: (r: WorkspaceRole) => MatrixCell }[] = [
  { title: "Facturatie & abonnement", note: "Afrekenen vanuit de app is nog niet live.", cell: r => r === "owner" },
  { title: "Workspace verwijderen", cell: r => checkWorkspaceDelete(r, "x", "x") === null },
  { title: "Iemand eigenaar maken", cell: r => canAssignRole(r, "owner") },
  { title: "Team & uitnodigingen", cell: r => canManageTeam(r) },
  { title: "Naam, adres & eigen domein", cell: r => canManageTeam(r) },
  { title: "API-sleutels, webhooks & OAuth-apps", cell: r => canUseDeveloperTools(r) },
  { title: "Profiel Hub van de workspace bewerken", cell: r => canEditWorkspaceHub(r) },
  { title: "QR-codes & korte links maken", note: "Nog niet per rol beperkt: elk lid kan dit.", cell: () => true },
];
export function RoleMatrix() {
  const [focus, setFocus] = useState<WorkspaceRole | null>(null);
  const mark = (v: MatrixCell) => typeof v === "string" ? <span className="text-xs">{v}</span> : v
    ? <Check className="size-4 text-docs-link" aria-label="Toegestaan" />
    : <X className="size-4 text-muted-foreground" aria-label="Niet toegestaan" />;
  return <div className="my-6">
    <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Markeer een rol">
      {MATRIX_ROLES.map(r => <button key={r} type="button" aria-pressed={focus === r} onClick={() => setFocus(focus === r ? null : r)} className={`rounded-full border px-3 py-1 text-xs ${focus === r ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground"}`}>{ROLE_LABELS[r]}</button>)}
    </div>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <thead><tr><th className="p-3">Recht</th>{MATRIX_ROLES.map(r => <th key={r} className={`p-3 text-center ${focus === r ? "bg-secondary" : ""}`}>{ROLE_LABELS[r]}</th>)}</tr></thead>
      <tbody>{MATRIX_ROWS.map(row => <tr key={row.title} className="border-t border-border">
        <th className="p-3 font-medium">{row.title}{row.note && <span className="block text-xs font-normal text-muted-foreground">{row.note}</span>}</th>
        {MATRIX_ROLES.map(r => <td key={r} className={`p-3 ${focus === r ? "bg-secondary" : ""}`}><span className="flex justify-center">{mark(row.cell(r))}</span></td>)}
      </tr>)}</tbody>
    </table></div>
  </div>;
}
export function WorkspaceVsPersonalTable() { return <CompareTable other="Workspace" rows={[{ feature: "Toegang", rout: "Jouw persoonlijke login", other: "Teamleden met een eigen login" }, { feature: "Identiteit", rout: "Je persoonlijke profiel", other: "Een aparte bedrijfsomgeving" }, { feature: "Beheer", rout: "Persoonlijke gegevens", other: "Eigen leden, domeinen en opslag" }]} />; }
/** Illustrates the storage bar in workspace settings; turns amber from 80% and red from 95%. */
export function LimitBar({ used = 45, limit = 50, unit = "GB", label = "Opslag van deze workspace" }: { used?: number; limit?: number; unit?: string; label?: string }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = pct >= 95 ? "bg-destructive" : pct >= 80 ? "bg-docs-warning" : "bg-primary";
  return <figure className="my-6 rounded-lg border border-border p-4">
    <figcaption className="mb-2 flex items-baseline justify-between gap-3 text-sm"><span className="font-medium">{label}</span><span className="font-mono text-xs text-muted-foreground">{used} {unit} / {limit} {unit} gebruikt</span></figcaption>
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used} aria-label={label}><div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} /></div>
    <p className="mt-2 text-xs text-muted-foreground">{pct}% · Voorbeeld{pct >= 80 ? " — bijna vol: ruim bestanden op of kies een groter plan." : ""}</p>
  </figure>;
}
export function AnalyticsPreview() { return <div className="my-8 grid grid-cols-3 gap-3">{[["Opgeslagen QR", "24"], ["Korte links", "8"], ["Totaal scans", "1.284"]].map(([label, value]) => <div key={label} className="min-w-0 rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-xl font-medium">{value}</p><span className="text-xs text-muted-foreground">Voorbeelddata</span></div>)}</div>; }
export function SecurityShield({ status }: { status?: string }) { return <div role="status" className="my-6 flex items-center gap-3 border-y border-border py-5"><ShieldCheck className="size-6 text-docs-link" /><span>{status ?? "Platformstatus niet live geverifieerd"}</span></div>; }
export function WarningBox({ children }: { children: ReactNode }) { return <aside className="my-6 flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-5 text-sm"><AlertTriangle className="size-5 shrink-0 text-destructive" /><div>{children}</div></aside>; }
export function PrintSizeCalculator() {
 const [distance, setDistance] = useState(25); const [dpi, setDpi] = useState(300);
 const mm = Math.max(25, distance); // Conservative 10:1 distance heuristic, not a scanner guarantee.
 return <section className="my-8 border-y border-border py-6"><h3>Afdrukberekening</h3><label className="mt-4 block text-sm">Scanafstand (cm)<Input type="number" min={1} max={1000} value={distance} onChange={e => setDistance(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))} /></label><label className="mt-4 block text-sm">Resolutie (DPI)<Input type="number" min={72} max={1200} value={dpi} onChange={e => setDpi(Math.max(72, Math.min(1200, Number(e.target.value) || 72)))} /></label><output className="mt-5 block font-mono">Richtmaat {mm} mm · {mmToPx(mm, dpi)} × {mmToPx(mm, dpi)} pixels</output><p className="text-xs text-muted-foreground">10:1-vuistregel met 25 mm ondergrens, geen gegarandeerde minimummaat. Test het werkelijke drukwerk.</p></section>;
}
export function DynamicQRFlowchart() { return <figure className="my-8 space-y-4 border-y border-border py-6">{[["Statisch", "Scan", "Bestemming"], ["Dynamisch", "Scan", "ROUT korte link", "Wijzigbare bestemming"]].map(([label, ...nodes]) => <div key={label}><p className="mb-2 text-sm font-medium">{label}</p><div className="flex flex-wrap items-center gap-2 text-xs">{nodes.map((s, i) => <span key={s} className="flex items-center gap-2">{i > 0 && <ArrowRight className="size-4 text-muted-foreground" />}<span className="border border-border px-3 py-2">{s}</span></span>)}</div></div>)}</figure>; }
export function DesignPlayground() { const [radius, setRadius] = useState(8); return <section className="my-8 border-y border-border py-6"><label className="text-sm">Geometrie · {radius}px</label><Slider className="mt-4" value={[radius]} max={32} step={1} onValueChange={v => setRadius(v[0] ?? 8)} /><div className="mt-6 border border-border bg-secondary p-6" style={{ borderRadius: radius }}><strong>ROUT / Studio</strong><p className="text-sm text-muted-foreground">Sharp → Pill</p></div></section>; }
export function ContentGrid({ category }: { category?: DocCategory }) {
 const entries = docs.filter(d => category ? d.category === category && d.path !== `/${category}` : !["about", "info", "dev", "safety"].includes(d.category));
 return <div className="not-prose my-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{entries.map(d => <Link to={d.path} key={d.path} className="group rounded-lg border border-border p-5 transition-colors hover:bg-secondary"><span className="text-xs text-muted-foreground">{DOC_LABELS[d.category]}</span><h3 className="mt-2 text-base font-medium">{d.title}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{d.description}</p><ArrowRight className="mt-4 size-4 text-docs-link" /></Link>)}</div>;
}
