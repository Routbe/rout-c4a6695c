import { useEffect, useState } from "react";
import { Check, Copy, Download, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

import { AppLayout } from "@/components/layout/AppLayout";
import { PressNav } from "@/components/press/PressSubpage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitContactMessage } from "@/lib/contact.functions";
import { RoutButtonKit } from "@/components/dev/RoutButtonKit";
import { i18n as trI18n } from "@/lib/i18n";

type Asset = {
  name: string;
  note: string;
  preview: string;
  surface: "light" | "dark" | "checker";
  files: { label: string; href: string }[];
};

const ASSETS: Asset[] = [
  {
    name: "Logo met woordmerk",
    note: "Konijn-icoon met ROUT ernaast. Voor lichte achtergronden.",
    preview: "/press/rout-lockup.svg",
    surface: "light",
    files: [
      { label: "SVG", href: "/press/rout-lockup.svg" },
      { label: "PNG", href: "/press/rout-lockup.png" },
    ],
  },
  {
    name: "Logo met woordmerk, licht",
    note: "Witte tekst, voor donkere achtergronden.",
    preview: "/press/rout-lockup-light.svg",
    surface: "dark",
    files: [
      { label: "SVG", href: "/press/rout-lockup-light.svg" },
      { label: "PNG", href: "/press/rout-lockup-light.png" },
    ],
  },
  {
    name: "Icoon, transparant",
    note: "Het konijn op een transparante achtergrond.",
    preview: "/press/rout-icon-transparent-512.png",
    surface: "checker",
    files: [
      { label: "SVG", href: "/press/rout-icon.svg" },
      { label: "PNG 512", href: "/press/rout-icon-transparent-512.png" },
      { label: "PNG 1024", href: "/press/rout-icon-transparent-1024.png" },
      { label: "PNG 2048", href: "/press/rout-icon-transparent-2048.png" },
    ],
  },
  {
    name: "Wit op zwart",
    note: "Eén kleur, voor druk en donkere vlakken.",
    preview: "/press/rout-icon-white-on-black.svg",
    surface: "dark",
    files: [
      { label: "SVG", href: "/press/rout-icon-white-on-black.svg" },
      { label: "PNG", href: "/press/rout-icon-white-on-black.png" },
    ],
  },
  {
    name: "Zwart op wit",
    note: "Eén kleur, voor kranten en faxvriendelijke druk.",
    preview: "/press/rout-icon-black-on-white.svg",
    surface: "light",
    files: [
      { label: "SVG", href: "/press/rout-icon-black-on-white.svg" },
      { label: "PNG", href: "/press/rout-icon-black-on-white.png" },
    ],
  },
];

const COLORS = [
  { name: "Obsidian", hex: "#131211", use: "Donkere achtergrond" },
  { name: "Obsidian kaart", hex: "#1D1C1B", use: "Donkere vlakken" },
  { name: "Inkt", hex: "#1A1A1A", use: "Tekst op licht" },
  { name: "Warm papier", hex: "#FBF9F5", use: "Lichte achtergrond" },
  { name: "Crème", hex: "#F4F1EA", use: "Tekst op donker" },
  { name: "Matcha", hex: "#2D493D", use: "Accent" },
  { name: "Konijn paars", hex: "#7026E1", use: "Buitenring logo" },
  { name: "Konijn mint", hex: "#41DB97", use: "Binnenring logo" },
];

const BOILERPLATE = {
  short:
    "ROUT is een Europese, soevereine identiteits- en QR-infrastructuur. Mensen en bedrijven krijgen één geverifieerd profiel, inloggen zonder wachtwoord en dynamische QR-codes — gehost in de EU, zonder datahandel.",
  long:
    "ROUT (rout.be) bouwt digitale identiteit die van de gebruiker zelf blijft. Leden krijgen een eigen profielpagina met schone URL, een geverifieerde badge voor personen, influencers en bedrijven, en een privacy-alias die hun e-mailadres afschermt. Via \"Login met ROUT\" kunnen apps en partners leden veilig laten inloggen op basis van open standaarden (OpenID Connect), met expliciete toestemming per gegeven. Daarnaast levert ROUT dynamische en statische QR-codes, korte links met cookieloze statistieken, batchgeneratie en eigen domeinen; de ROUT Card als fysieke kaart en Wallet-pas met drie scanlagen; fooi- en betaalpagina's waarbij het geld rechtstreeks naar de maker gaat; en een Connections Hub voor sociale accounts en integraties. Alle data staat op Europese infrastructuur; ROUT verkoopt geen gebruikersgegevens en toont geen advertenties.",
};

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button variant="ghost" size="sm"
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast.error(trI18n.t("ui.488990e04e"));
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label={`${label} kopiëren`}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? "Gekopieerd" : label}
    </Button>
  );
}

const SURFACE: Record<Asset["surface"], string> = {
  light: "bg-[hsl(40_43%_97%)]",
  dark: "bg-[hsl(30_6%_7%)]",
  checker:
    "bg-[conic-gradient(hsl(var(--muted))_25%,hsl(var(--background))_0_50%,hsl(var(--muted))_0_75%,hsl(var(--background))_0)] bg-[length:20px_20px]",
};

function PressForm() {
  const [loadedAt, setLoadedAt] = useState<number | undefined>();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  useEffect(() => setLoadedAt(Date.now()), []);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const org = String(f.get("organisation") ?? "").trim();
    setBusy(true);
    try {
      const res = await submitContactMessage({
        data: {
          name: String(f.get("name") ?? ""),
          email: String(f.get("email") ?? ""),
          subject: `[Pers] ${String(f.get("subject") ?? "")}`.slice(0, 150),
          message: `${org ? `Organisatie: ${org}\n\n` : ""}${String(f.get("message") ?? "")}`.slice(0, 2000),
          locale: "nl",
          company: String(f.get("company") ?? ""),
          ...(loadedAt ? { formLoadedAt: loadedAt } : {}),
        },
      });
      if (!res.ok) {
        toast.error(res.reason === "rate_limited" ? "Even geduld, probeer het straks opnieuw." : "Versturen mislukte.");
        return;
      }
      setSent(true);
    } catch {
      toast.error(trI18n.t("ui.2482a0b570"));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <p className="rounded-xl border border-border bg-card p-5 text-sm text-foreground">
        Bedankt. Je bericht is goed ontvangen; we antwoorden zo snel mogelijk.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <Label htmlFor="p-name">Naam</Label>
        <Input id="p-name" name="name" required maxLength={100} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="p-email">E-mailadres</Label>
        <Input id="p-email" name="email" type="email" required maxLength={255} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="p-org">Redactie of organisatie</Label>
        <Input id="p-org" name="organisation" maxLength={120} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="p-subject">Onderwerp</Label>
        <Input id="p-subject" name="subject" required maxLength={140} placeholder="Interview, partnership, …" />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="p-msg">Bericht</Label>
        <Textarea id="p-msg" name="message" required rows={5} maxLength={1800} />
      </div>
      <input type="text" name="company" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <div className="sm:col-span-2">
        <Button type="submit" disabled={busy} className="rounded-lg">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verstuur aanvraag"}
        </Button>
      </div>
    </form>
  );
}

export default function Press() {
  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl px-4 py-14 sm:py-20">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Pers & merk</p>
        <h1 className="mt-2 font-display text-4xl text-foreground sm:text-5xl">Brand & press kit</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Officiële logo's, kleuren en een standaardtekst over ROUT. Vrij te gebruiken in
          berichtgeving over ROUT — vervorm of herkleur het logo niet.
        </p>
        <PressNav />

        <section className="mt-14" aria-labelledby="assets">
          <h2 id="assets" className="font-display text-2xl text-foreground">Logo's</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ASSETS.map((a) => (
              <article key={a.name} className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className={`flex h-40 items-center justify-center p-6 ${SURFACE[a.surface]}`}>
                  <img src={a.preview} alt={a.name} className="max-h-full max-w-full object-contain" loading="lazy" />
                </div>
                <div className="space-y-3 p-4">
                  <div>
                    <h3 className="text-sm font-medium text-foreground">{a.name}</h3>
                    <p className="text-xs text-muted-foreground">{a.note}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {a.files.map((f) => (
                      <a
                        key={f.href}
                        href={f.href}
                        download
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-muted"
                      >
                        <Download className="h-3.5 w-3.5" /> {f.label}
                      </a>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-16" aria-labelledby="colors">
          <h2 id="colors" className="font-display text-2xl text-foreground">Kleurenpalet</h2>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {COLORS.map((c) => (
              <div key={c.hex} className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="h-20 border-b border-border" style={{ backgroundColor: c.hex }} />
                <div className="space-y-2 p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.use}</p>
                  </div>
                  <CopyButton value={c.hex} label={c.hex} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16" aria-labelledby="about">
          <h2 id="about" className="font-display text-2xl text-foreground">Over ROUT</h2>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {(["short", "long"] as const).map((k) => (
              <div key={k} className="space-y-3 rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-foreground">{k === "short" ? "Kort" : "Uitgebreid"}</h3>
                  <CopyButton value={BOILERPLATE[k]} label="Kopieer" />
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{BOILERPLATE[k]}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-16"><RoutButtonKit /></div>

        <section className="mt-16" aria-labelledby="contact">
          <h2 id="contact" className="font-display text-2xl text-foreground">Perscontact</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Voor interviews, mediavragen en partnerships. Liever rechtstreeks?{" "}
            <a href="mailto:hallo@rout.be" className="inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline">
              <Mail className="h-3.5 w-3.5" /> hallo@rout.be
            </a>
          </p>
          <div className="mt-6 rounded-2xl border border-border bg-card p-5 sm:p-6">
            <PressForm />
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
