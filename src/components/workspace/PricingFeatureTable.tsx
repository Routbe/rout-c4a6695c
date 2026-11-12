import { Check, ChevronDown, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WORKSPACE_PRICING, quotaLabel } from "@/lib/workspace-pricing";

const features: { label: string; values: (string | boolean)[] }[] = [
  { label: "Cloudopslag", values: ["0 MB", "5 GB", "50 GB", "250 GB gedeeld"] },
  { label: "OIDC-apps / API-integraties", values: WORKSPACE_PRICING.map(p => quotaLabel(p.oidcApps)) },
  { label: "QR-codes", values: WORKSPACE_PRICING.map(p => quotaLabel(p.qrCodes)) },
  { label: "Standaard profieladres", values: [true, true, true, true] },
  { label: "Bluesky-handle", values: [false, true, true, true] },
  { label: "Extra pagina’s & basis analytics", values: [false, true, true, true] },
  { label: "Eigen domein & private relay", values: [false, false, true, true] },
  { label: "Credentials API¹", values: [false, false, true, true] },
  { label: "Uitgebreide ZK-retentie¹", values: [false, false, true, true] },
  { label: "Teambeheer & white-label", values: [false, false, false, true] },
  { label: "Priority Architecture Support", values: [false, false, false, true] },
  { label: "Edge-Accelerated Profiles¹", values: [false, false, false, true] },
];
export function PricingFeatureTable() {
  return <Collapsible className="mt-6">
    <CollapsibleTrigger asChild><Button variant="ghost" className="h-auto w-full whitespace-normal py-3 text-center">Bekijk volledige feature-vergelijking <ChevronDown className="size-4 shrink-0" /></Button></CollapsibleTrigger>
    <CollapsibleContent className="mt-4">
      <Table className="min-w-[660px]"><TableHeader><TableRow><TableHead>Functie</TableHead>{WORKSPACE_PRICING.map(p => <TableHead key={p.id} className="text-center">{p.label}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{features.map(row => <TableRow key={row.label}><TableCell className="font-medium">{row.label}</TableCell>{row.values.map((value, i) => <TableCell key={i} className="text-center">{typeof value === "boolean" ? value ? <Check className="mx-auto size-4 text-accent" aria-label="Inbegrepen" /> : <Minus className="mx-auto size-4 text-muted-foreground" aria-label="Niet inbegrepen" /> : value}</TableCell>)}</TableRow>)}</TableBody></Table>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">¹ Vereist activering en verificatie van de bijbehorende dienst. Een planselectie activeert geen betaling, uitgifte-API of CDN-prioriteit.</p>
    </CollapsibleContent>
  </Collapsible>;
}