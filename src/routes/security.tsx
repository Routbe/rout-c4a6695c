import { pathCardMeta } from "@/lib/path-cards";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PillarDetails } from "@/components/PrivacyBadge";
import { useI18n } from "@/lib/i18n";
import { PILLAR_IDS, pillar } from "@/lib/privacy-pillars";

const TITLE = "Trust Center | ROUT";
const DESC = "Hoe ROUT gegevens beschermt: lokale versleuteling, standaard OIDC, minimale gegevensdeling en gecontroleerde toegang.";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [...pathCardMeta("/security", "nl"), 
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SecurityPage,
});

const SCHEMA = `create table public.calendar_events (
  id bigint generated always as identity primary key,
  calendar_id uuid not null references public.connected_calendars (id),
  provider_id text not null check (provider_id ~ '^[0-9a-f]{64}$'), -- HMAC-SHA256
  start_utc timestamptz not null,
  end_utc timestamptz not null,
  is_blocking boolean not null default true
); -- no title, description, location or attendee columns

create table public.availability_cache (
  user_id uuid not null,
  day date not null,
  free_bits bit(96) not null, -- 96 x 15 min, UTC
  primary key (user_id, day)
);`;

const SCOPE_CHECK = `// Every scoped request: the URL scope is verified server-side.
if (scope.type === "user" && scope.id !== userId) throw Forbidden;
if (scope.type === "workspace" && !(await getWorkspaceRole(userId, scope.id))) throw Forbidden;
// Free or unverified workspace: quota 0 MB -> 403 Storage Quota Exceeded`;

const OAUTH = `GET /oauth/authorize?client_id=…&scope=openid profile email&code_challenge=…
-> consent screen lists every requested scope
-> token only carries the scopes the user approved`;

function SecurityPage() {
  const { locale } = useI18n();
  const nl = locale.startsWith("nl");
  const rows = nl
    ? [
        ["Agenda-inhoud", "Volledige afspraken worden vaak opgeslagen", "Alleen anonieme vrij/bezet-bitmaps"],
        ["Tracking", "Advertentie- en analysetrackers van derden", "Geen trackers van derden"],
        ["Login bij andere apps", "Brede toegang, weinig zicht op scopes", "Expliciete OAuth-scopes per app"],
        ["Donaties", "Geld via de rekening van het platform", "EPC-QR rechtstreeks naar je bank"],
        ["Teams", "Gedeelde caches en losse rechten", "Scope in het adres, servercontrole per verzoek"],
      ]
    : [
        ["Calendar content", "Full events are often stored", "Only anonymous free/busy bitmaps"],
        ["Tracking", "Third-party ad and analytics trackers", "No third-party trackers"],
        ["Sign-in to other apps", "Broad access, little scope visibility", "Explicit OAuth scopes per app"],
        ["Donations", "Money flows through the platform's account", "EPC QR straight to your bank"],
        ["Teams", "Shared caches and loose permissions", "Scope in the address, server check per request"],
      ];
  return (
    <main className="mx-auto w-full max-w-4xl space-y-10 px-4 py-12">
      <header className="space-y-3">
        <p className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground"><ShieldCheck className="size-4 text-primary" aria-hidden />Trust Center</p>
        <h1 className="font-display text-3xl tracking-tight sm:text-4xl">{nl ? "Privacy die je kunt controleren" : "Privacy you can verify"}</h1>
        <p className="max-w-2xl text-muted-foreground">{nl ? "Geen vage “100% privé”-belofte, maar per onderdeel precies wat we wel en niet opslaan, met het technische bewijs erbij." : "No vague “100% private” promise: per feature exactly what we do and do not store, with the technical proof."}</p>
      </header>

      {PILLAR_IDS.map((id) => (
        <section key={id} id={id} className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 sm:p-6">
          <p className="mb-3 font-mono text-xs uppercase tracking-widest text-primary">{pillar(id, locale).label}</p>
          <PillarDetails p={pillar(id, locale)} nl={nl} />
        </section>
      ))}

      <section className="space-y-3">
        <h2 className="font-display text-2xl">{nl ? "Traditionele SaaS vs. ROUT" : "Traditional SaaS vs. ROUT"}</h2>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="p-3">{nl ? "Onderdeel" : "Area"}</th><th className="p-3">{nl ? "Traditionele SaaS" : "Traditional SaaS"}</th><th className="p-3">ROUT</th></tr>
            </thead>
            <tbody>
              {rows.map(([a, b, c]) => (
                <tr key={a} className="border-t border-border"><td className="p-3 font-medium">{a}</td><td className="p-3 text-muted-foreground">{b}</td><td className="p-3">{c}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl">{nl ? "Live bewijs" : "Live proof"}</h2>
        <Accordion type="multiple" className="space-y-2">
          {[
            ["schema", nl ? "Database-schema van de agenda" : "Calendar database schema", SCHEMA],
            ["scope", nl ? "Scope-controle op de server" : "Server-side scope check", SCOPE_CHECK],
            ["oauth", nl ? "OAuth-toestemmingsflow" : "OAuth consent flow", OAUTH],
          ].map(([v, title, code]) => (
            <AccordionItem key={v} value={v!} className="rounded-2xl border border-border bg-card px-4">
              <AccordionTrigger className="hover:no-underline">{title}</AccordionTrigger>
              <AccordionContent><pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed">{code}</pre></AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <section className="space-y-2 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-2xl">{nl ? "Datamanifest" : "Data manifest"}</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>{nl ? "Donaties: EPC-QR rechtstreeks naar de bank van de maker, ROUT raakt het geld niet aan." : "Donations: EPC QR straight to the creator's bank; ROUT never touches the money."}</li>
          <li>{nl ? "Koppelingssleutels van derden: versleuteld met AES-256-GCM." : "Third-party connection keys: encrypted with AES-256-GCM."}</li>
          <li>{nl ? "Afbeeldingen van derden op publieke pagina's lopen via onze proxy, zodat je IP-adres niet bij die diensten komt." : "Third-party images on public pages go through our proxy so your IP address never reaches those services."}</li>
        </ul>
        <a href="/privacy" className="inline-flex pt-2 text-sm font-medium text-primary underline-offset-4 hover:underline">{nl ? "Lees de privacyverklaring →" : "Read the privacy policy →"}</a>
      </section>
    </main>
  );
}
