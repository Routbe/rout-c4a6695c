import { Link } from "@tanstack/react-router";
import { Download } from "lucide-react";
import type { ReactNode } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export type PressFile = { name: string; size: string; use: string; href: string; ratio: string };

export function PressNav() {
  const { locale } = useI18n();
  const labels = { nl: ["Logo's & merk", "Google Wallet-beelden", "Deelafbeeldingen"], en: ["Logos & brand", "Google Wallet artwork", "Share previews"], fr: ["Logos & marque", "Visuels Google Wallet", "Aperçus de partage"], de: ["Logos & Marke", "Google-Wallet-Bilder", "Vorschaubilder"] }[locale];
  const items = [["/press", labels[0]], ["/press/wallet", labels[1]], ["/press/previews", labels[2]]] as const;
  return <nav aria-label="Perskit" className="mt-8 flex flex-wrap gap-2">
    {items.map(([to, label]) => <Button key={to} asChild variant="outline" size="sm"><Link to={to} activeOptions={{ exact: true }} activeProps={{ "aria-current": "page" }}>{label}</Link></Button>)}
  </nav>;
}

export function PressSubpage({ kicker, title, intro, children }: { kicker: string; title: string; intro: string; children: ReactNode }) {
  return <AppLayout>
    <main className="mx-auto max-w-5xl px-6 py-14">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">{kicker}</p>
      <h1 className="mt-3 font-display text-4xl text-foreground sm:text-5xl">{title}</h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">{intro}</p>
      <PressNav />
      {children}
    </main>
  </AppLayout>;
}

export function PressFileGrid({ files }: { files: PressFile[] }) {
  const { locale } = useI18n();
  const download = { nl: "Download", en: "Download", fr: "Télécharger", de: "Herunterladen" }[locale];
  return <ul className="mt-10 grid gap-6 sm:grid-cols-2">
    {files.map((f) => <li key={f.href} className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-center bg-muted p-4" style={{ aspectRatio: "16 / 9" }}>
        <img src={f.href} alt={f.name} loading="lazy" className="max-h-full max-w-full object-contain" />
      </div>
      <div className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <h2 className="font-medium text-foreground">{f.name}</h2>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{f.size} · PNG</p>
          <p className="mt-2 text-sm text-muted-foreground">{f.use}</p>
        </div>
        <Button asChild variant="outline" size="icon" aria-label={`${download}: ${f.name}`}><a href={f.href} download><Download /></a></Button>
      </div>
    </li>)}
  </ul>;
}
