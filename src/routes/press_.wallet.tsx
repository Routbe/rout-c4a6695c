import { pathCardMeta } from "@/lib/path-cards";
import { createFileRoute } from "@tanstack/react-router";
import { canonicalLink, SITE_ORIGIN } from "@/lib/site";
import { PressFileGrid, PressSubpage, type PressFile } from "@/components/press/PressSubpage";
import { useI18n } from "@/lib/i18n";

const TITLE = "Google Wallet-beelden | ROUT perskit";
const DESCRIPTION = "Officiële ROUT-beelden voor Google Wallet: logo 660×660, breed logo 1280×400, hero 1032×336 en afbeeldingsmodules, in code getekend uit het echte ROUT-logo.";

const FILES: PressFile[] = [
  { name: "Logo", size: "660 × 660", ratio: "1", use: "Google Wallet-console → Logo. Wordt rond bijgesneden; het konijn blijft binnen de ringen.", href: "/assets/wallet/rout-logo.png" },
  { name: "Breed logo", size: "1280 × 400", ratio: "3.2", use: "Console → Wide logo. Vervangt het ronde logo bovenaan de pas.", href: "/assets/wallet/rout-wide-logo.png" },
  { name: "Hero-afbeelding (klasse)", size: "1032 × 336", ratio: "3.07", use: "Console → Hero image. Algemene kaart zonder persoonsgegevens; elk lid krijgt automatisch een eigen hero in zijn profielkleur.", href: "/assets/wallet/rout-hero.png" },
  { name: "Module: ROUT Card", size: "1860 × 620", ratio: "3", use: "Console → Image modules. Legt de drie scanlagen van de kaart uit.", href: "/assets/wallet/rout-card-module.png" },
  { name: "Module: Trust array", size: "1032 × 336", ratio: "3.07", use: "Console → Image modules. Vertrouwensbalk onderaan de pas.", href: "/assets/wallet/compliance-array.png" },
  { name: "Soeverein zegel", size: "660 × 660", ratio: "1", use: "Alternatief vierkant beeld voor modules of de uitgeversaccount.", href: "/assets/wallet/sovereign-seal-pbr.png" },
  { name: "Logo · console alias", size: "660 × 660", ratio: "1", use: "Logo · ROUT", href: "/assets/wallet/logo-shield.png" },
];

export const Route = createFileRoute("/press_/wallet")({
  head: () => ({
    meta: [...pathCardMeta("/press/wallet", "nl"), { title: TITLE }, { name: "description", content: DESCRIPTION }, { property: "og:title", content: TITLE }, { property: "og:description", content: DESCRIPTION }, { property: "og:type", content: "website" }, { property: "og:url", content: `${SITE_ORIGIN}/press/wallet` }, { name: "twitter:card", content: "summary_large_image" }],
    links: [canonicalLink("/press/wallet")],
  }),
  component: Page,
});

function Page() {
  const { locale } = useI18n();
  const copy = {
    nl: { title: "Google Wallet-beelden", intro: "Publieke ROUT-PNG’s voor logo, hero en afbeeldingsmodules. De maten hieronder zijn de werkelijke bestandsgroottes. Deze algemene beelden bevatten geen persoonsgegevens of toegangscodes.", heading: "Plaatsing in de Wallet-console", steps: ["Kies de Generic-klasse van je ROUT-pas in de Google Pay & Wallet-console.", "Gebruik het vierkante logo of het brede logo in het bijbehorende veld.", "Gebruik de algemene hero als standaard; persoonlijke uitgifte gebruikt het openbare kaartontwerp van het lid.", "Voeg de ROUT Card- en trust-beelden toe als afbeeldingsmodules."], notice: "Uitgifte vereist een geautoriseerd uitgever-ID en serviceaccount. Publieke PNG’s bewijzen geen identiteit en verlenen geen toegang.", names: ["Logo", "Breed logo", "Hero", "ROUT Card-module", "Trust-module", "Soeverein zegel"], uses: ["Logo · vierkant, met veilige ruimte voor rond bijsnijden.", "Wide logo · brede merkidentiteit.", "Hero image · algemene kaart zonder persoonsgegevens.", "Image modules · publieke uitleg van de scanlagen.", "Image modules · publieke vertrouwensbalk.", "Image modules · algemeen merkzegel."] },
    en: { title: "Google Wallet artwork", intro: "Public ROUT PNGs for logos, hero images and image modules. Dimensions below are the actual file dimensions. This generic artwork contains no personal data or access codes.", heading: "Placement in the Wallet console", steps: ["Select your ROUT pass Generic class in the Google Pay & Wallet console.", "Use the square or wide logo in its matching field.", "Set the generic hero as the default; personal issuance uses the member’s public card design.", "Add the ROUT Card and trust artwork as image modules."], notice: "Issuance requires an authorized issuer ID and service account. Public PNGs do not prove identity or grant access.", names: ["Logo", "Wide logo", "Hero", "ROUT Card module", "Trust module", "Sovereign seal"], uses: ["Logo · square, with a safe area for circular cropping.", "Wide logo · horizontal brand identity.", "Hero image · generic card without personal data.", "Image modules · public explanation of the scan layers.", "Image modules · public trust strip.", "Image modules · generic brand seal."] },
    fr: { title: "Visuels Google Wallet", intro: "PNG publics ROUT pour les logos, l’image principale et les modules d’images. Les dimensions indiquées sont celles des fichiers. Ces visuels génériques ne contiennent ni données personnelles ni codes d’accès.", heading: "Placement dans la console Wallet", steps: ["Sélectionnez la classe Generic du pass ROUT dans la console Google Pay & Wallet.", "Placez le logo carré ou large dans le champ correspondant.", "Définissez l’image principale générique par défaut ; l’émission personnelle utilise le design public du membre.", "Ajoutez les visuels ROUT Card et de confiance comme modules d’images."], notice: "L’émission nécessite un ID d’émetteur et un compte de service autorisés. Les PNG publics ne prouvent pas l’identité et ne donnent aucun accès.", names: ["Logo", "Logo large", "Image principale", "Module ROUT Card", "Module de confiance", "Sceau souverain"], uses: ["Logo · carré, avec une marge pour le recadrage circulaire.", "Wide logo · identité horizontale.", "Hero image · carte générique sans données personnelles.", "Image modules · présentation publique des couches de scan.", "Image modules · bandeau de confiance public.", "Image modules · sceau de marque générique."] },
    de: { title: "Google-Wallet-Bilder", intro: "Öffentliche ROUT-PNGs für Logos, Hero-Bilder und Bildmodule. Die angegebenen Maße entsprechen den Dateien. Diese allgemeinen Bilder enthalten keine persönlichen Daten oder Zugangscodes.", heading: "Platzierung in der Wallet-Konsole", steps: ["Wähle die Generic-Klasse deines ROUT-Passes in der Google-Pay-&-Wallet-Konsole.", "Verwende das quadratische oder breite Logo im passenden Feld.", "Lege das allgemeine Hero-Bild als Standard fest; persönliche Pässe verwenden das öffentliche Kartendesign des Mitglieds.", "Füge die ROUT-Card- und Vertrauensbilder als Bildmodule hinzu."], notice: "Die Ausgabe benötigt eine autorisierte Aussteller-ID und ein Dienstkonto. Öffentliche PNGs beweisen keine Identität und gewähren keinen Zugang.", names: ["Logo", "Breites Logo", "Hero-Bild", "ROUT-Card-Modul", "Vertrauensmodul", "Souveränes Siegel"], uses: ["Logo · quadratisch, mit Sicherheitsabstand für runden Zuschnitt.", "Wide logo · horizontale Markenidentität.", "Hero image · allgemeine Karte ohne persönliche Daten.", "Image modules · öffentliche Erklärung der Scan-Ebenen.", "Image modules · öffentliche Vertrauensleiste.", "Image modules · allgemeines Markensiegel."] },
  }[locale];
  return <PressSubpage kicker="ROUT / GOOGLE WALLET" title={copy.title} intro={copy.intro}>
    <PressFileGrid files={FILES.map((file, i) => ({ ...file, name: copy.names[i] ?? file.name, use: copy.uses[i] ?? file.use }))} />
    <section className="mt-14 max-w-3xl text-sm leading-7 text-muted-foreground"><h2 className="font-display text-2xl text-foreground">{copy.heading}</h2><ol className="mt-4 list-decimal space-y-2 pl-5">{copy.steps.map(step => <li key={step}>{step}</li>)}</ol><p className="mt-4">{copy.notice}</p></section>
  </PressSubpage>;
}

