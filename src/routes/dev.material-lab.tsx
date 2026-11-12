import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { Bell, Menu, RefreshCw, Shield, Sparkles, User } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SpatialChoice } from "@/components/ui/spatial-choice";
import { WalletVault } from "@/components/wallet/WalletVault";
import { RoutCardDialog } from "@/components/wallet/RoutCardDialog";
import { ShareWidget } from "@/components/dashboard/ShareCardWidgets";
import { InterfaceThemePicker, InterfaceThemeSwitcher } from "@/components/settings/InterfaceThemeSwitcher";

/**
 * Development-only proof sheet: real workspace components with sample data,
 * so both materials can be inspected without a signed-in session.
 */
export const Route = createFileRoute("/dev/material-lab")({
  beforeLoad: () => { if (!import.meta.env.DEV) throw notFound(); },
  head: () => ({
    meta: [
      { title: "Materiaal-proefpagina — ROUT (ontwikkeling)" },
      { name: "description", content: "Interne ontwikkelpagina om de werkruimte-ontwerpen Mechanical en Glass te vergelijken." },
      { property: "og:title", content: "Materiaal-proefpagina — ROUT" },
      { property: "og:description", content: "Interne ontwikkelpagina voor de werkruimte-ontwerpen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MaterialLab,
});

function MaterialLab() {
  const [share, setShare] = useState<"link" | "card" | "qr">("link");
  const [live, setLive] = useState(true);
  return (
    <AppLayout title="Command Center" description="Proefpagina met voorbeeldgegevens" crumbs={[{ label: "Ontwikkeling" }, { label: "Materialen" }]}
      actions={<div className="flex flex-wrap gap-2">
        <Button variant="outline" data-lab="sync"><RefreshCw /> Sync</Button>
        <Button variant="secondary" data-lab="customize">Aanpassen</Button>
        <Button data-lab="primary"><Sparkles /> Studio</Button>
      </div>}>
      <div className="space-y-6">
        <section data-lab="wallet-vault" className="max-w-md">
          <WalletVault />
        </section>
        <section data-lab="share-widget" className="max-w-md">
          <ShareWidget handle="aurelinemathieu" />
        </section>
        <section data-lab="rout-card" className="max-w-md">
          <RoutCardDialog inline open onOpenChange={() => {}} handle="aurelinemathieu" />
        </section>
        <section data-lab="appearance" className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
          <h2 className="text-lg font-medium">Weergave</h2>
          <InterfaceThemePicker />
          <InterfaceThemeSwitcher />
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card data-lab="static-card">
            <CardHeader><CardTitle>Wat wil je delen?</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <SpatialChoice<typeof share> label="Soort" value={share} onChange={setShare}
                options={[{ value: "link", label: "Link" }, { value: "card", label: "Kaart" }, { value: "qr", label: "QR-code" }]} />
              <div className="flex flex-wrap items-center gap-2">
                <Button data-lab="publish">Publiceren</Button>
                <Button variant="outline">Voorbeeld</Button>
                <Button variant="ghost">Annuleren</Button>
                <Button variant="destructive">Verwijderen</Button>
                <Button variant="link">Meer info</Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>Pro</Badge><Badge variant="secondary">Live</Badge><Badge variant="outline">Concept</Badge>
                <span data-lab="status" className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs">
                  <span className="size-1.5 rounded-full bg-live" /> Online
                </span>
              </div>
            </CardContent>
          </Card>

          <section data-lab="profile-box" className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
            <h2 className="text-lg font-medium">Profielgegevens</h2>
            <label className="block text-xs font-medium text-muted-foreground" htmlFor="lab-name">Weergavenaam</label>
            <Input id="lab-name" defaultValue="Jona Zeno" className="h-11" />
            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <span className="text-sm">Live Presence</span>
              <Switch checked={live} onCheckedChange={setLive} aria-label="Live Presence" />
            </div>
            <div className="flex items-center gap-1" data-lab="icon-row">
              <Button variant="ghost" size="icon" aria-label="Profiel"><User /></Button>
              <Button variant="ghost" size="icon" aria-label="Beveiliging"><Shield /></Button>
              <Button variant="ghost" size="icon" aria-label="Meldingen"><Bell /></Button>
              <Button variant="outline" size="icon" aria-label="Menu"><Menu /></Button>
            </div>
          </section>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList data-lab="tabs">
            <TabsTrigger value="overview">Overzicht</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="settings">Instellingen</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">128 scans deze week · 12 nieuwe volgers</TabsContent>
          <TabsContent value="analytics" className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">Grafiek</TabsContent>
          <TabsContent value="settings" className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">Instellingen</TabsContent>
        </Tabs>

        <Dialog>
          <DialogTrigger asChild><Button variant="outline" data-lab="dialog-open">Dialoog openen</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Publiceren bevestigen</DialogTitle><DialogDescription>Je profiel wordt meteen zichtbaar.</DialogDescription></DialogHeader>
            <div className="flex justify-end gap-2"><Button variant="ghost">Terug</Button><Button>Publiceren</Button></div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
