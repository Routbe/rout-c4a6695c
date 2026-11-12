import { pathCardMeta } from "@/lib/path-cards";
import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback, RoutePendingSkeleton } from "@/components/RouteFallbacks";
import { canonicalLink, canonicalMeta, socialImageMeta } from "@/lib/site";
import { AppLayout } from "@/components/layout/AppLayout";
import { CodeBlock } from "@/components/CodeBlock";
import { useI18n } from "@/lib/i18n";

import { GITHUB_ACCOUNT, GITHUB_REPO_URL } from "@/lib/social-links";

const REPO_CLONE = GITHUB_REPO_URL;
const GITHUB_ORG = GITHUB_ACCOUNT;

interface Step {
  id: string;
  short: string;
  title: string;
  body: string;
  code?: string;
  language?: string;
}

const STEPS_EN: Step[] = [
  {
    id: "1-clone",
    short: "1. Clone",
    title: "1. Clone the repository",
    body: "ROUT is licensed under AGPLv3. Grab the source and install dependencies with Bun (or npm).",
    code: `git clone ${REPO_CLONE}\ncd rout-qr\nbun install`,
  },
  {
    id: "2-database",
    short: "2. Database",
    title: "2. Create a database project",
    body: "ROUT stores tracked QR codes and scan events in Postgres. Create a Postgres-compatible project and note its connection string (DATABASE_URL).",
  },
  {
    id: "3-env",
    short: "3. Env",
    title: "3. Configure environment variables",
    body: "Create a .env file with the public client keys, then add the server-side secrets in your hosting provider (never commit them).",
    language: "env",
    code:
      "# server-only\n" +
      "DATABASE_URL=postgres://<user>:<password>@<host>/<database>?sslmode=require\n" +
      "PUBLIC_SITE_URL=https://<your-domain>\n" +
      "BREVO_API_KEY=<brevo-api-key>",
  },
  {
    id: "4-migrations",
    short: "4. Migrations",
    title: "4. Run the database migrations",
    body: "Apply the SQL files in db/ to create the tracked_qrs and qr_scans tables, their row-level-security policies and grants. Uploaded images, PDFs and audio are stored in Postgres itself — no external object storage is required.",
    code: 'psql "$DATABASE_URL" -f db/00_compat.sql',
  },
  {
    id: "5-dev",
    short: "5. Dev server",
    title: "5. Start the development server",
    body: "The app runs on http://localhost:8080 with hot reload.",
    code: "bun run dev",
  },
  {
    id: "6-deploy",
    short: "6. Deploy",
    title: "6. Deploy",
    body: "Build the production bundle and deploy to any edge-compatible host (Cloudflare Workers, Vercel, Netlify). Set the same server-side environment variables in your host and point your custom domain at it — short links use your own domain, so scans never touch third-party infrastructure.",
    code: "bun run build",
  },
  {
    id: "7-compliance",
    short: "7. Compliance",
    title: "7. Keep your fork compliant",
    body: "AGPLv3 requires that you publish the source of any modified version you make available over a network. Keep the ROUT attribution and license notice intact, and link back to your own source repository.",
  },
];

const STEPS_NL: Step[] = [
  {
    id: "1-clone",
    short: "1. Klonen",
    title: "1. Repository klonen",
    body: "ROUT valt onder AGPLv3. Haal de broncode op en installeer de dependencies met Bun (of npm).",
    code: `git clone ${REPO_CLONE}\ncd rout-qr\nbun install`,
  },
  {
    id: "2-database",
    short: "2. Database",
    title: "2. Databaseproject aanmaken",
    body: "ROUT bewaart trackbare QR-codes en scan-events in Postgres. Maak een Postgres-compatibel project en noteer de connection string (DATABASE_URL).",
  },
  {
    id: "3-env",
    short: "3. Env",
    title: "3. Omgevingsvariabelen instellen",
    body: "Maak een .env-bestand met de publieke client-keys en zet de server-side secrets bij je hostingprovider (nooit committen).",
    language: "env",
    code:
      "# enkel server\n" +
      "DATABASE_URL=postgres://<user>:<password>@<host>/<database>?sslmode=require\n" +
      "PUBLIC_SITE_URL=https://<jouw-domein>\n" +
      "BREVO_API_KEY=<brevo-api-key>",
  },
  {
    id: "4-migrations",
    short: "4. Migraties",
    title: "4. Databasemigraties uitvoeren",
    body: "Voer de SQL-bestanden in db/ uit om de tabellen tracked_qrs en qr_scans met hun row-level-security-policies en grants aan te maken. Maak ook een private storage-bucket qr-files voor geüploade afbeeldingen, PDF\u2019s en audio.",
    code: 'psql "$DATABASE_URL" -f db/00_compat.sql',
  },
  {
    id: "5-dev",
    short: "5. Devserver",
    title: "5. Ontwikkelserver starten",
    body: "De app draait op http://localhost:8080 met hot reload.",
    code: "bun run dev",
  },
  {
    id: "6-deploy",
    short: "6. Deployen",
    title: "6. Deployen",
    body: "Bouw de productiebundel en deploy naar een edge-compatibele host (Cloudflare Workers, Vercel, Netlify). Zet dezelfde server-side omgevingsvariabelen bij je host en koppel je eigen domein — korte links draaien dan op jouw domein, zodat scans nooit langs infrastructuur van derden gaan.",
    code: "bun run build",
  },
  {
    id: "7-compliance",
    short: "7. Compliance",
    title: "7. Houd je fork conform",
    body: "AGPLv3 verplicht je om de broncode van elke aangepaste versie die je via een netwerk aanbiedt te publiceren. Laat de ROUT-attributie en licentievermelding staan en verwijs naar je eigen bronrepository.",
  },
];

const PREREQUISITES = [
  "Node.js >= 18 or Bun v1.0+",
  "Postgres database (Neon or self-hosted)",
  "Custom domain with DNS access",
];

function SelfHosting() {
  const { locale, t } = useI18n();
  const steps = locale === "nl" ? STEPS_NL : STEPS_EN;

  return (
    <AppLayout crumbs={[{ label: "Self-hosting" }]}>
      <div className="mx-auto max-w-2xl">
        <p className="eyebrow">{t("footer.openSource")}</p>
        <h1 className="mt-2 font-display text-[36px] leading-tight text-foreground">
          {t("footer.selfHostingPage")}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {locale === "nl"
            ? "ROUT is volledig open source. Volg deze stappen om je eigen instantie te draaien — jouw domein, jouw database, jouw data."
            : "ROUT is fully open source. Follow these steps to run your own instance — your domain, your database, your data."}
        </p>

        <nav className="mb-6 flex items-center gap-2 overflow-x-auto border-b border-border/40 py-2 text-xs text-muted-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {steps.map((step) => (
            <a
              key={step.id}
              href={`#${step.id}`}
              className="flex-shrink-0 whitespace-nowrap rounded-full px-3 py-1 transition-colors hover:bg-muted hover:text-foreground"
            >
              {step.short}
            </a>
          ))}
        </nav>

        <div className="my-6 rounded-xl border border-border/60 bg-muted/40 p-4">
          <span className="mb-2 block font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Prerequisites
          </span>
          <div className="flex flex-wrap gap-2">
            {PREREQUISITES.map((p) => (
              <span
                key={p}
                className="inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-background px-2.5 py-1 font-mono text-[11px] text-foreground"
              >
                <span aria-hidden className="text-emerald-500">
                  ✓
                </span>
                {p}
              </span>
            ))}
          </div>
        </div>

        <ol className="space-y-8">
          {steps.map((step) => (
            <li key={step.id} id={step.id} className="scroll-mt-24 space-y-2">
              <h2 className="text-base font-semibold text-foreground">{step.title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              {step.code && (
                <CodeBlock code={step.code} language={step.language ?? "bash"} className="mt-2" />
              )}
            </li>
          ))}
        </ol>

        <div className="mt-10 border-t border-border pt-6">
          <a
            href={GITHUB_ORG}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            🐙 View Source on GitHub
          </a>
        </div>
      </div>
    </AppLayout>
  );
}

export const Route = createFileRoute("/self-hosting")({
  head: () => ({
    meta: [...pathCardMeta("/self-hosting", "nl"), 
      { title: "Self-hosting ROUT" },
      {
        name: "description",
        content: "Draai ROUT op je eigen infrastructuur: installatie, configuratie en updates.",
      },
      { property: "og:title", content: "Self-hosting ROUT" },
      {
        property: "og:description",
        content: "Draai ROUT op je eigen infrastructuur: installatie, configuratie en updates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SelfHosting,
});
