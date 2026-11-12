import { pathCardMeta } from "@/lib/path-cards";
import { createFileRoute } from "@tanstack/react-router";
import { canonicalLink, SITE_ORIGIN } from "@/lib/site";
import { PressFileGrid, PressSubpage, type PressFile } from "@/components/press/PressSubpage";
import { useI18n } from "@/lib/i18n";

const TITLE = "Deelafbeeldingen | ROUT perskit";
const DESCRIPTION = "De officiële deelkaarten (1200×630) die ROUT toont op WhatsApp, LinkedIn, Slack en X, per pagina en per taal.";

const PAGES = [["home", "Startpagina"], ["about", "Over ROUT"], ["explore", "Ontdekken"], ["press", "Perskit"], ["sovereignty", "Soevereiniteit"], ["privacy", "Privacy"]] as const;
const FILES: PressFile[] = PAGES.map(([key, name]) => ({ name, size: "1200 × 630", ratio: "1.905", use: `Deelkaart voor de pagina ${name}. Ook beschikbaar in het Engels, Frans en Duits.`, href: `/brand/og/${key}-nl.png` }));

export const Route = createFileRoute("/press_/previews")({
  head: () => ({
    meta: [...pathCardMeta("/press/previews", "nl"), { title: TITLE }, { name: "description", content: DESCRIPTION }, { property: "og:title", content: TITLE }, { property: "og:description", content: DESCRIPTION }, { property: "og:type", content: "website" }, { property: "og:url", content: `${SITE_ORIGIN}/press/previews` }, { name: "twitter:card", content: "summary_large_image" }],
    links: [canonicalLink("/press/previews")],
  }),
  component: Page,
});

function Page() {
  const { locale } = useI18n();
  const copy = { nl: ["Deelafbeeldingen", "Officiële ROUT-deelkaarten, getekend uit het merklogo. Kies bovenaan je taal om de bijbehorende bestanden te bekijken.", "Publieke deelkaart", "Startpagina", "Over ROUT", "Ontdekken", "Perskit", "Soevereiniteit", "Privacy"], en: ["Share previews", "Official ROUT share cards, drawn from the brand logo. Choose your language above to see the matching files.", "Public share card", "Home", "About ROUT", "Explore", "Press kit", "Sovereignty", "Privacy"], fr: ["Aperçus de partage", "Cartes de partage officielles ROUT, dessinées à partir du logo. Choisissez votre langue en haut pour voir les fichiers correspondants.", "Carte de partage publique", "Accueil", "À propos de ROUT", "Explorer", "Kit presse", "Souveraineté", "Confidentialité"], de: ["Vorschaubilder", "Offizielle ROUT-Vorschaubilder auf Basis des Markenlogos. Wähle oben deine Sprache für die passenden Dateien.", "Öffentliches Vorschaubild", "Startseite", "Über ROUT", "Entdecken", "Pressekit", "Souveränität", "Datenschutz"] }[locale];
  return <PressSubpage kicker="ROUT / PRESS" title={copy[0] ?? TITLE} intro={copy[1] ?? DESCRIPTION}>
    <PressFileGrid files={FILES.map((file, i) => ({ ...file, name: copy[i + 3] ?? file.name, use: copy[2] ?? "ROUT", href: file.href.replace("-nl.png", `-${locale}.png`) }))} />
  </PressSubpage>;
}
