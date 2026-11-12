import type { LegalLocale } from "@/lib/legal-locale";

/**
 * Structured, type-safe legal content.
 *
 * Text supports a tiny inline markup: `**bold**` and bare `contact@rout.be` /
 * `rout.be` become a strong span and a link respectively (see LegalRichText).
 * Only English, Dutch and French are fully translated; every other locale
 * falls back to English string by string.
 */

export type Block = { kind: "p"; text: string } | { kind: "ul"; items: string[] };

export interface LegalSection {
  id: string;
  /** Zero-padded section number, e.g. "01". */
  n: string;
  title: string;
  blocks?: Block[];
  /** Visual treatment: amber warning, emerald callout, or a 2-col card grid. */
  variant?: "warning" | "ok" | "grid";
  cards?: { title: string; detail: string }[];
}

export interface LegalDoc {
  title: string;
  updated: string;
  badges?: string[];
  chips: { id: string; label: string }[];
  sections: LegalSection[];
  contactCta?: string;
}

export interface LegalUi {
  download: string;
  downloadHint: string;
  language: string;
  more: string;
  jump: string;
}

const uiEn: LegalUi = {
  download: "Download PDF",
  downloadHint: "Print or save this document as PDF",
  language: "Language",
  more: "More",
  jump: "Jump to section",
};

const ui: Partial<Record<LegalLocale, LegalUi>> = {
  en: uiEn,
  nl: {
    download: "Download PDF",
    downloadHint: "Print dit document of bewaar het als PDF",
    language: "Taal",
    more: "Meer",
    jump: "Spring naar sectie",
  },
  fr: {
    download: "Télécharger le PDF",
    downloadHint: "Imprimer ce document ou l’enregistrer en PDF",
    language: "Langue",
    more: "Plus",
    jump: "Aller à la section",
  },
};

export function legalUi(locale: LegalLocale): LegalUi {
  return { ...uiEn, ...(ui[locale] ?? {}) };
}

/* ------------------------------------------------------------------ terms */

const termsEn: LegalDoc = {
  title: "Terms of Use",
  updated: "Last updated: August 2026",
  chips: [
    { id: "scope", label: "Scope" },
    { id: "fair-use", label: "Fair Use" },
    { id: "print-warning", label: "Print Warning" },
    { id: "domains", label: "Custom Domains" },
    { id: "api", label: "API & Rates" },
    { id: "sla", label: "SLA" },
    { id: "licensing", label: "Licensing" },
    { id: "jurisdiction", label: "Jurisdiction" },
  ],
  sections: [
    {
      id: "scope",
      n: "01",
      title: "Scope & core architecture",
      blocks: [
        {
          kind: "p",
          text: "ROUT provides high-precision QR generation tools and sovereign digital infrastructure.",
        },
        {
          kind: "ul",
          items: [
            "**Static QR codes:** generated entirely client-side within your browser. They operate independently of ROUT servers and function permanently, with zero server-side data dependency.",
            "**Dynamic QR codes & routing:** rely on our hosted redirection infrastructure (rout.be). Dynamic paths facilitate real-time tracking, analytics, and target URL updates.",
          ],
        },
      ],
    },
    {
      id: "handles",
      n: "02",
      title: "User accounts, handles & namespace allocation",
      blocks: [
        {
          kind: "ul",
          items: [
            "Account handles, usernames, and profile namespaces are allocated on a strict first-come, first-served basis.",
            "ROUT reserves the absolute right to reclaim, reassign, or terminate handles associated with trademark infringement, impersonation, automated squatting, or prolonged inactivity without prior notice.",
            "Account verification and advanced features may require a non-refundable micro-payment or service fee to cover processing costs and prevent spam.",
          ],
        },
      ],
    },
    {
      id: "domains",
      n: "03",
      title: "Custom domains & external DNS",
      blocks: [
        {
          kind: "ul",
          items: [
            "Users may link custom domains to the ROUT infrastructure via CNAME, TXT, or SRV records.",
            "Users bear sole responsibility for configuring, maintaining, and renewing external DNS records and SSL certificates. ROUT accepts no liability for routing failures, propagation delays, or downtime caused by misconfigured external DNS providers.",
          ],
        },
      ],
    },
    {
      id: "api",
      n: "04",
      title: "API access & rate limits",
      blocks: [
        {
          kind: "ul",
          items: [
            "Programmatic access via API keys is granted for legitimate integration and automation purposes.",
            "We enforce strict rate limits to preserve system integrity and prevent infrastructure abuse. ROUT reserves the right to throttle, suspend, or revoke API access immediately upon detecting excessive load, scraping, or suspicious traffic patterns.",
          ],
        },
      ],
    },
    {
      id: "payments",
      n: "05",
      title: "Payments, fees & digital goods",
      blocks: [
        {
          kind: "ul",
          items: [
            "Fees for account verification, custom domains, or premium features are processed as instant digital service fees.",
            "Because routing infrastructure and digital verification tokens are provisioned instantaneously upon payment completion, all micro-payments and fees are strictly **non-refundable**.",
          ],
        },
      ],
    },
    {
      id: "fair-use",
      n: "06",
      title: "Fair use & instant kill-switch",
      blocks: [
        { kind: "p", text: "It is strictly prohibited to use ROUT infrastructure for:" },
        {
          kind: "ul",
          items: [
            "Phishing, malware distribution, deceptive redirects, or fraudulent campaigns.",
            "Spam, harassment, or any activity violating applicable laws.",
            "Automated load testing or scraping that degrades performance for other users.",
          ],
        },
        {
          kind: "p",
          text: "**Enforcement:** ROUT maintains an immediate zero-tolerance policy and reserves the right to deactivate dynamic links, revoke handles, or terminate accounts instantly and without prior notice upon any suspected violation.",
        },
      ],
    },
    {
      id: "print-warning",
      n: "07",
      title: "Limitation of liability & print protection",
      variant: "warning",
      blocks: [
        {
          kind: "ul",
          items: [
            "To the maximum extent permitted by law, ROUT and its creator shall not be liable for any direct, indirect, incidental, or consequential damages — including printing costs, re-printing expenses, marketing losses, or business interruption — arising from faulty user input, system downtime, expired domains, or dynamic redirection errors.",
            "**Mandatory print warning:** users are solely responsible for thoroughly testing and verifying the scan functionality and target destination of a dynamic or static QR code before initiating physical print runs, packaging, or public marketing campaigns.",
          ],
        },
      ],
    },
    {
      id: "sla",
      n: "08",
      title: 'Service availability & "as-is" SLA',
      blocks: [
        {
          kind: "ul",
          items: [
            'Hosted services, dynamic redirection, and API endpoints are provided on an **"as-is"** and **"as-available"** basis.',
            "No enterprise-grade uptime guarantees, financial SLAs, or continuous availability warranties are provided for free or standard hosted tiers. Scheduled or unscheduled maintenance may occur at any time.",
          ],
        },
      ],
    },
    {
      id: "licensing",
      n: "09",
      title: "Open source licensing (AGPL-3.0 vs. hosted SaaS)",
      blocks: [
        {
          kind: "ul",
          items: [
            "The underlying source code of ROUT is open-source and licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**, allowing inspection, modification, and self-hosting under the terms of that license.",
            "These Terms of Use govern exclusively the usage of the hosted commercial/SaaS platform provided at rout.be. Self-hosted instances operating outside our infrastructure are bound solely by the AGPL-3.0 license.",
          ],
        },
      ],
    },
    {
      id: "creator",
      n: "10",
      title: "Non-commercial creator disclaimer",
      blocks: [
        {
          kind: "p",
          text: "ROUT is operated as an independent developer infrastructure project by an individual creator, and is not registered as a formal corporate entity. Services are offered purely on a best-effort basis to support open protocols and digital sovereignty.",
        },
      ],
    },
    {
      id: "jurisdiction",
      n: "11",
      title: "Governing law & jurisdiction",
      blocks: [
        {
          kind: "p",
          text: "These Terms are governed by and construed in accordance with the laws of Belgium. Any legal disputes arising in connection with these terms shall fall under the exclusive jurisdiction of the courts of Brussels, Belgium.",
        },
      ],
    },
    {
      id: "contact",
      n: "12",
      title: "Contact",
      blocks: [
        {
          kind: "p",
          text: "For legal notices, infrastructure abuse reports, or terms-related inquiries, contact: contact@rout.be.",
        },
      ],
    },
  ],
};

const termsNl: LegalDoc = {
  title: "Gebruiksvoorwaarden",
  updated: "Laatst bijgewerkt: augustus 2026",
  chips: [
    { id: "scope", label: "Toepassing" },
    { id: "fair-use", label: "Fair use" },
    { id: "print-warning", label: "Drukwaarschuwing" },
    { id: "domains", label: "Eigen domeinen" },
    { id: "api", label: "API & limieten" },
    { id: "sla", label: "SLA" },
    { id: "licensing", label: "Licentie" },
    { id: "jurisdiction", label: "Bevoegdheid" },
  ],
  sections: [
    {
      id: "scope",
      n: "01",
      title: "Toepassingsgebied & architectuur",
      blocks: [
        {
          kind: "p",
          text: "ROUT levert hoogprecieze QR-generatietools en soevereine digitale infrastructuur.",
        },
        {
          kind: "ul",
          items: [
            "**Statische QR-codes:** volledig client-side in je browser gegenereerd. Ze werken onafhankelijk van de ROUT-servers en blijven permanent functioneren, zonder enige serverafhankelijkheid.",
            "**Dynamische QR-codes & routing:** draaien op onze gehoste doorverwijzingsinfrastructuur (rout.be). Dynamische paden maken realtime tracking, statistieken en het aanpassen van bestemmings-URL’s mogelijk.",
          ],
        },
      ],
    },
    {
      id: "handles",
      n: "02",
      title: "Accounts, handles & naamruimte",
      blocks: [
        {
          kind: "ul",
          items: [
            "Handles, gebruikersnamen en profielnaamruimtes worden strikt toegekend volgens het principe “wie eerst komt, eerst maalt”.",
            "ROUT behoudt zich het volledige recht voor om handles terug te vorderen, opnieuw toe te wijzen of te beëindigen bij merkinbreuk, imitatie, geautomatiseerd squatten of langdurige inactiviteit, zonder voorafgaande kennisgeving.",
            "Accountverificatie en geavanceerde functies kunnen een niet-terugbetaalbare micro-betaling of servicekost vereisen om verwerkingskosten te dekken en spam tegen te gaan.",
          ],
        },
      ],
    },
    {
      id: "domains",
      n: "03",
      title: "Eigen domeinen & externe DNS",
      blocks: [
        {
          kind: "ul",
          items: [
            "Gebruikers kunnen eigen domeinen koppelen aan de ROUT-infrastructuur via CNAME-, TXT- of SRV-records.",
            "Gebruikers zijn als enige verantwoordelijk voor het configureren, onderhouden en verlengen van externe DNS-records en SSL-certificaten. ROUT aanvaardt geen aansprakelijkheid voor routingfouten, propagatievertraging of downtime door verkeerd geconfigureerde externe DNS-providers.",
          ],
        },
      ],
    },
    {
      id: "api",
      n: "04",
      title: "API-toegang & limieten",
      blocks: [
        {
          kind: "ul",
          items: [
            "Programmatische toegang via API-sleutels wordt verleend voor legitieme integratie- en automatiseringsdoeleinden.",
            "We hanteren strikte rate limits om de systeemintegriteit te bewaken en misbruik te voorkomen. ROUT mag API-toegang onmiddellijk vertragen, opschorten of intrekken bij overmatige belasting, scraping of verdacht verkeer.",
          ],
        },
      ],
    },
    {
      id: "payments",
      n: "05",
      title: "Betalingen, kosten & digitale goederen",
      blocks: [
        {
          kind: "ul",
          items: [
            "Kosten voor accountverificatie, eigen domeinen of premiumfuncties worden verwerkt als onmiddellijke digitale servicekosten.",
            "Omdat routinginfrastructuur en digitale verificatietokens onmiddellijk na betaling worden geleverd, zijn alle micro-betalingen en kosten strikt **niet-terugbetaalbaar**.",
          ],
        },
      ],
    },
    {
      id: "fair-use",
      n: "06",
      title: "Fair use & directe kill-switch",
      blocks: [
        { kind: "p", text: "Het is strikt verboden de ROUT-infrastructuur te gebruiken voor:" },
        {
          kind: "ul",
          items: [
            "Phishing, verspreiding van malware, misleidende doorverwijzingen of frauduleuze campagnes.",
            "Spam, intimidatie of elke activiteit die de toepasselijke wetgeving schendt.",
            "Geautomatiseerde belastingstests of scraping die de prestaties voor andere gebruikers aantasten.",
          ],
        },
        {
          kind: "p",
          text: "**Handhaving:** ROUT voert een onmiddellijk nultolerantiebeleid en mag dynamische links deactiveren, handles intrekken of accounts beëindigen — direct en zonder voorafgaande kennisgeving — bij elke vermoedelijke inbreuk.",
        },
      ],
    },
    {
      id: "print-warning",
      n: "07",
      title: "Aansprakelijkheidsbeperking & drukbescherming",
      variant: "warning",
      blocks: [
        {
          kind: "ul",
          items: [
            "Voor zover wettelijk toegestaan zijn ROUT en zijn maker niet aansprakelijk voor directe, indirecte, incidentele of gevolgschade — waaronder drukkosten, herdrukkosten, marketingverlies of bedrijfsonderbreking — voortvloeiend uit foutieve invoer, downtime, verlopen domeinen of fouten in dynamische doorverwijzing.",
            "**Verplichte drukwaarschuwing:** gebruikers zijn als enige verantwoordelijk om de scanbaarheid en bestemming van een dynamische of statische QR-code grondig te testen vóór fysieke drukopdrachten, verpakkingen of publieke marketingcampagnes.",
          ],
        },
      ],
    },
    {
      id: "sla",
      n: "08",
      title: "Beschikbaarheid & “as-is” SLA",
      blocks: [
        {
          kind: "ul",
          items: [
            "Gehoste diensten, dynamische doorverwijzing en API-endpoints worden geleverd **“as-is”** en **“as-available”**.",
            "Er worden geen enterprise-uptimegaranties, financiële SLA’s of continuïteitsgaranties geboden op gratis of standaard gehoste plannen. Gepland of ongepland onderhoud kan op elk moment plaatsvinden.",
          ],
        },
      ],
    },
    {
      id: "licensing",
      n: "09",
      title: "Opensourcelicentie (AGPL-3.0 vs. gehoste SaaS)",
      blocks: [
        {
          kind: "ul",
          items: [
            "De broncode van ROUT is opensource onder de **GNU Affero General Public License v3.0 (AGPL-3.0)**, wat inspectie, aanpassing en self-hosting toestaat binnen de voorwaarden van die licentie.",
            "Deze gebruiksvoorwaarden gelden uitsluitend voor het gehoste SaaS-platform op rout.be. Self-hosted installaties buiten onze infrastructuur vallen enkel onder de AGPL-3.0-licentie.",
          ],
        },
      ],
    },
    {
      id: "creator",
      n: "10",
      title: "Niet-commerciële disclaimer",
      blocks: [
        {
          kind: "p",
          text: "ROUT wordt beheerd als een onafhankelijk infrastructuurproject door één maker en is niet geregistreerd als vennootschap. Diensten worden op best-effortbasis aangeboden ter ondersteuning van open protocollen en digitale soevereiniteit.",
        },
      ],
    },
    {
      id: "jurisdiction",
      n: "11",
      title: "Toepasselijk recht & bevoegde rechtbank",
      blocks: [
        {
          kind: "p",
          text: "Deze voorwaarden worden beheerst door het Belgische recht. Elk geschil valt onder de exclusieve bevoegdheid van de rechtbanken van Brussel, België.",
        },
      ],
    },
    {
      id: "contact",
      n: "12",
      title: "Contact",
      blocks: [
        {
          kind: "p",
          text: "Voor juridische kennisgevingen, misbruikmeldingen of vragen over deze voorwaarden: contact@rout.be.",
        },
      ],
    },
  ],
};

const termsFr: LegalDoc = {
  title: "Conditions d’utilisation",
  updated: "Dernière mise à jour : août 2026",
  chips: [
    { id: "scope", label: "Portée" },
    { id: "fair-use", label: "Usage loyal" },
    { id: "print-warning", label: "Avert. impression" },
    { id: "domains", label: "Domaines" },
    { id: "api", label: "API & limites" },
    { id: "sla", label: "SLA" },
    { id: "licensing", label: "Licence" },
    { id: "jurisdiction", label: "Juridiction" },
  ],
  sections: [
    {
      id: "scope",
      n: "01",
      title: "Portée & architecture",
      blocks: [
        {
          kind: "p",
          text: "ROUT fournit des outils de génération de QR codes de haute précision et une infrastructure numérique souveraine.",
        },
        {
          kind: "ul",
          items: [
            "**QR codes statiques :** générés entièrement côté client, dans votre navigateur. Ils fonctionnent indépendamment des serveurs ROUT, de façon permanente et sans aucune dépendance serveur.",
            "**QR codes dynamiques & routage :** reposent sur notre infrastructure de redirection hébergée (rout.be). Les chemins dynamiques permettent le suivi en temps réel, les statistiques et la mise à jour des URL de destination.",
          ],
        },
      ],
    },
    {
      id: "handles",
      n: "02",
      title: "Comptes, identifiants & espace de noms",
      blocks: [
        {
          kind: "ul",
          items: [
            "Les identifiants, noms d’utilisateur et espaces de profil sont attribués strictement par ordre d’arrivée.",
            "ROUT se réserve le droit absolu de récupérer, réattribuer ou supprimer tout identifiant lié à une contrefaçon de marque, une usurpation d’identité, un squattage automatisé ou une inactivité prolongée, sans préavis.",
            "La vérification de compte et les fonctions avancées peuvent exiger un micro-paiement ou des frais de service non remboursables, destinés à couvrir les coûts et à limiter le spam.",
          ],
        },
      ],
    },
    {
      id: "domains",
      n: "03",
      title: "Domaines personnalisés & DNS externe",
      blocks: [
        {
          kind: "ul",
          items: [
            "Les utilisateurs peuvent relier leurs propres domaines à l’infrastructure ROUT via des enregistrements CNAME, TXT ou SRV.",
            "L’utilisateur est seul responsable de la configuration, de la maintenance et du renouvellement des enregistrements DNS et certificats SSL externes. ROUT décline toute responsabilité en cas d’échec de routage, de délai de propagation ou d’indisponibilité causés par un fournisseur DNS mal configuré.",
          ],
        },
      ],
    },
    {
      id: "api",
      n: "04",
      title: "Accès API & limites de débit",
      blocks: [
        {
          kind: "ul",
          items: [
            "L’accès programmatique par clés API est accordé à des fins légitimes d’intégration et d’automatisation.",
            "Des limites strictes sont appliquées pour préserver l’intégrité du système et prévenir les abus. ROUT peut restreindre, suspendre ou révoquer immédiatement l’accès API en cas de charge excessive, de scraping ou de trafic suspect.",
          ],
        },
      ],
    },
    {
      id: "payments",
      n: "05",
      title: "Paiements, frais & biens numériques",
      blocks: [
        {
          kind: "ul",
          items: [
            "Les frais de vérification, de domaines personnalisés ou de fonctions premium sont traités comme des services numériques immédiats.",
            "L’infrastructure de routage et les jetons de vérification étant fournis instantanément après paiement, tous les micro-paiements et frais sont strictement **non remboursables**.",
          ],
        },
      ],
    },
    {
      id: "fair-use",
      n: "06",
      title: "Usage loyal & coupure immédiate",
      blocks: [
        { kind: "p", text: "Il est strictement interdit d’utiliser l’infrastructure ROUT pour :" },
        {
          kind: "ul",
          items: [
            "Le hameçonnage, la diffusion de logiciels malveillants, les redirections trompeuses ou les campagnes frauduleuses.",
            "Le spam, le harcèlement ou toute activité contraire à la loi applicable.",
            "Les tests de charge automatisés ou le scraping dégradant les performances pour les autres utilisateurs.",
          ],
        },
        {
          kind: "p",
          text: "**Application :** ROUT applique une tolérance zéro immédiate et peut désactiver des liens dynamiques, révoquer des identifiants ou clôturer des comptes instantanément et sans préavis en cas de violation suspectée.",
        },
      ],
    },
    {
      id: "print-warning",
      n: "07",
      title: "Limitation de responsabilité & protection impression",
      variant: "warning",
      blocks: [
        {
          kind: "ul",
          items: [
            "Dans toute la mesure permise par la loi, ROUT et son créateur ne sauraient être tenus responsables de dommages directs, indirects, accessoires ou consécutifs — frais d’impression, de réimpression, pertes marketing ou interruption d’activité — résultant d’une saisie erronée, d’une indisponibilité, d’un domaine expiré ou d’une erreur de redirection dynamique.",
            "**Avertissement impression obligatoire :** l’utilisateur est seul responsable de tester et vérifier la lisibilité et la destination d’un QR code statique ou dynamique avant tout tirage physique, emballage ou campagne publique.",
          ],
        },
      ],
    },
    {
      id: "sla",
      n: "08",
      title: "Disponibilité & SLA « en l’état »",
      blocks: [
        {
          kind: "ul",
          items: [
            "Les services hébergés, la redirection dynamique et les points d’accès API sont fournis **« en l’état »** et **« selon disponibilité »**.",
            "Aucune garantie de disponibilité de niveau entreprise, SLA financier ou garantie de continuité n’est offerte sur les offres gratuites ou standard. Une maintenance planifiée ou non peut survenir à tout moment.",
          ],
        },
      ],
    },
    {
      id: "licensing",
      n: "09",
      title: "Licence open source (AGPL-3.0 vs. SaaS hébergé)",
      blocks: [
        {
          kind: "ul",
          items: [
            "Le code source de ROUT est open source sous **GNU Affero General Public License v3.0 (AGPL-3.0)**, autorisant l’inspection, la modification et l’auto-hébergement selon ces termes.",
            "Les présentes conditions régissent exclusivement la plateforme SaaS hébergée sur rout.be. Les instances auto-hébergées hors de notre infrastructure relèvent uniquement de la licence AGPL-3.0.",
          ],
        },
      ],
    },
    {
      id: "creator",
      n: "10",
      title: "Clause de créateur non commercial",
      blocks: [
        {
          kind: "p",
          text: "ROUT est exploité comme un projet d’infrastructure indépendant par un créateur individuel et n’est pas enregistré en tant que société. Les services sont proposés au mieux des efforts, au service des protocoles ouverts et de la souveraineté numérique.",
        },
      ],
    },
    {
      id: "jurisdiction",
      n: "11",
      title: "Droit applicable & juridiction",
      blocks: [
        {
          kind: "p",
          text: "Les présentes conditions sont régies par le droit belge. Tout litige relève de la compétence exclusive des tribunaux de Bruxelles, Belgique.",
        },
      ],
    },
    {
      id: "contact",
      n: "12",
      title: "Contact",
      blocks: [
        {
          kind: "p",
          text: "Pour toute notification légale, signalement d’abus ou question relative aux conditions : contact@rout.be.",
        },
      ],
    },
  ],
};

/* ---------------------------------------------------------------- privacy */

const privacyEn: LegalDoc = {
  title: "Privacy Policy",
  updated: "Last updated: August 2026 · GDPR / AVG compliant",
  badges: [
    "🇪🇺 EU hosted",
    "🛡️ No advertising trackers",
    "⚖️ GDPR / AVG compliant",
    "🏛️ GBA / APD Brussels",
  ],
  chips: [
    { id: "controller", label: "Controller" },
    { id: "static", label: "Static QR" },
    { id: "dynamic", label: "Analytics" },
    { id: "accounts", label: "Accounts & SSO" },
    { id: "domains", label: "Custom Domains" },
    { id: "api", label: "API Logs" },
    { id: "payments", label: "Payments" },
    { id: "hosting", label: "EU Hosting" },
    { id: "rights", label: "Your Rights" },
  ],
  contactCta: "✉️ Contact data request",
  sections: [
    {
      id: "controller",
      n: "01",
      title: "Legal basis & controller identification",
      blocks: [
        {
          kind: "p",
          text: "ROUT is operated as an independent developer infrastructure project by an individual creator, established in Brussels, Belgium (EU). The creator acts as the **data controller** for all processing described here. The architecture is zero-trust by design: local execution first, data minimisation throughout, and absolute transparency about what leaves your device.",
        },
        {
          kind: "p",
          text: "Contact channel for all privacy matters: contact@rout.be. Statutory response timeline: we answer data subject requests **within one calendar month**, in line with Article 12 GDPR.",
        },
        {
          kind: "p",
          text: "Primary supervisory authority: **Gegevensbeschermingsautoriteit (GBA) / Autorité de protection des données (APD)**, Drukpersstraat 35, 1000 Brussels, Belgium.",
        },
      ],
    },
    {
      id: "static",
      n: "02",
      title: "Static QR codes — absolute zero-data architecture",
      variant: "ok",
      blocks: [
        {
          kind: "p",
          text: "Static QR codes are compiled and generated entirely client-side, inside your browser’s local sandbox. Payload contents — URLs, vCards, Wi-Fi keys, IBAN strings — never touch ROUT servers, are never intercepted, and generate zero server-side logs or residual telemetry. Nothing is uploaded, so there is nothing for us to store, disclose, or lose.",
        },
      ],
    },
    {
      id: "dynamic",
      n: "03",
      title: "Dynamic routing, short links & anonymous analytics",
      blocks: [
        {
          kind: "ul",
          items: [
            "**Contractual necessity (Art. 6(1)(b) GDPR):** we process destination URLs solely to execute the redirects you requested.",
            "**Legitimate interest (Art. 6(1)(f) GDPR):** collection of coarse, strictly anonymised scan metadata — timestamp, country-level geolocation, and device category family.",
            "**Strict privacy guarantees:** full visitor IP addresses are never logged or stored. Visitor browser fingerprinting is explicitly disabled. Advertising profiling and cross-site tracking are fundamentally omitted.",
            "**Data lifecycle:** scan analytics are tied directly to the lifecycle of the dynamic link — purging or deleting a link instantly erases its aggregated statistics.",
          ],
        },
      ],
    },
    {
      id: "accounts",
      n: "04",
      title: "Authentication, user accounts & OAuth federation",
      blocks: [
        {
          kind: "ul",
          items: [
            "**Account data:** email addresses, secure password hashes (where applicable), and user profile configurations.",
            "**External SSO handlers:** when authenticating via external identity providers (such as GitHub, Google, Apple, GitLab, or a custom OIDC provider), ROUT securely ingests only the necessary baseline identifiers — email and display name — for active session maintenance.",
            "**Session integrity:** essential authentication state is maintained via isolated secure cookies and local storage tokens. Zero commercial tracking pixels or third-party analytics scripts exist on authenticated endpoints.",
          ],
        },
      ],
    },
    {
      id: "domains",
      n: "05",
      title: "Custom domains & infrastructure routing",
      blocks: [
        {
          kind: "p",
          text: "When end-users route traffic through custom domains linked to ROUT, core proxy and routing metadata are handled strictly for high-precision redirection and SSL termination. Visitor IP tracking on custom domain zones is disabled to preserve user sovereignty.",
        },
      ],
    },
    {
      id: "api",
      n: "06",
      title: "Programmatic access, API keys & rate limiting",
      blocks: [
        {
          kind: "p",
          text: "API interactions generate minimal technical access logs — timestamp, endpoint URI, response status, and rate-limiting counters — retained exclusively for infrastructure security, defence against DDoS attacks, and API stability enforcement.",
        },
      ],
    },
    {
      id: "payments",
      n: "07",
      title: "Micro-payments, verification fees & financial data",
      blocks: [
        {
          kind: "p",
          text: "Financial transactions for account verification or premium routing tiers are processed securely through certified, PCI-DSS compliant third-party payment gateways. ROUT does not store raw credit card credentials or sensitive financial instruments on its local infrastructure.",
        },
      ],
    },
    {
      id: "hosting",
      n: "08",
      title: "Sovereign infrastructure & hosting (EU)",
      blocks: [
        {
          kind: "p",
          text: "All user state and relational configurations are stored securely within European Union data centres on managed PostgreSQL infrastructure, under a strict Data Processing Agreement (DPA) featuring end-to-end encryption in transit and at rest.",
        },
      ],
    },
    {
      id: "rights",
      n: "09",
      title: "Enforceable data subject rights (GDPR Chapter III)",
      variant: "grid",
      cards: [
        {
          title: "Access & portability",
          detail: "Instant mechanisms to export a machine-readable copy of your personal data.",
        },
        {
          title: "Rectification & erasure",
          detail:
            "Immediate self-service deletion of accounts, custom links, and associated metadata.",
        },
        {
          title: "Restriction & objection",
          detail: "Rights to restrict or object to legitimate-interest processing at any time.",
        },
        {
          title: "Supervisory recourse",
          detail:
            "Explicit right to lodge a formal complaint with the Brussels GBA/APD, Drukpersstraat 35, 1000 Brussels.",
        },
      ],
    },
  ],
};

const privacyNl: LegalDoc = {
  title: "Privacybeleid",
  updated: "Laatst bijgewerkt: augustus 2026 · AVG/GDPR-conform",
  badges: [
    "🇪🇺 Gehost in de EU",
    "🛡️ Geen advertentietrackers",
    "⚖️ AVG/GDPR-conform",
    "🏛️ GBA Brussel",
  ],
  chips: [
    { id: "controller", label: "Verwerkings­verantw." },
    { id: "static", label: "Statische QR" },
    { id: "dynamic", label: "Statistieken" },
    { id: "accounts", label: "Accounts & SSO" },
    { id: "domains", label: "Eigen domeinen" },
    { id: "api", label: "API-logs" },
    { id: "payments", label: "Betalingen" },
    { id: "hosting", label: "EU-hosting" },
    { id: "rights", label: "Jouw rechten" },
  ],
  contactCta: "✉️ Contacteer voor een gegevensverzoek",
  sections: [
    {
      id: "controller",
      n: "01",
      title: "Rechtsgrond & verwerkingsverantwoordelijke",
      blocks: [
        {
          kind: "p",
          text: "ROUT wordt beheerd als een onafhankelijk infrastructuurproject door één maker, gevestigd in Brussel, België (EU). De maker treedt op als **verwerkingsverantwoordelijke** voor alle hier beschreven verwerkingen. De architectuur is zero-trust: eerst lokale uitvoering, altijd dataminimalisatie en volledige transparantie over wat je toestel verlaat.",
        },
        {
          kind: "p",
          text: "Contactkanaal voor privacyzaken: contact@rout.be. Wettelijke termijn: we beantwoorden verzoeken van betrokkenen **binnen één kalendermaand**, conform artikel 12 AVG.",
        },
        {
          kind: "p",
          text: "Bevoegde toezichthouder: **Gegevensbeschermingsautoriteit (GBA)**, Drukpersstraat 35, 1000 Brussel, België.",
        },
      ],
    },
    {
      id: "static",
      n: "02",
      title: "Statische QR-codes — absolute zero-data-architectuur",
      variant: "ok",
      blocks: [
        {
          kind: "p",
          text: "Statische QR-codes worden volledig client-side in de lokale sandbox van je browser samengesteld. De inhoud — URL’s, vCards, wifisleutels, IBAN-strings — bereikt nooit de ROUT-servers, wordt nooit onderschept en genereert geen serverlogs of telemetrie. Er wordt niets geüpload, dus is er niets om te bewaren, te delen of te verliezen.",
        },
      ],
    },
    {
      id: "dynamic",
      n: "03",
      title: "Dynamische routing, korte links & anonieme statistieken",
      blocks: [
        {
          kind: "ul",
          items: [
            "**Contractuele noodzaak (art. 6(1)(b) AVG):** we verwerken bestemmings-URL’s uitsluitend om de door jou gevraagde doorverwijzingen uit te voeren.",
            "**Gerechtvaardigd belang (art. 6(1)(f) AVG):** verzameling van grove, strikt geanonimiseerde scanmetadata — tijdstip, land en apparaatcategorie.",
            "**Strikte privacygaranties:** volledige IP-adressen van bezoekers worden nooit gelogd of bewaard. Browserfingerprinting is uitgeschakeld. Advertentieprofilering en cross-site tracking ontbreken volledig.",
            "**Levensduur:** scanstatistieken zijn gekoppeld aan de dynamische link — een link verwijderen wist onmiddellijk de bijhorende statistieken.",
          ],
        },
      ],
    },
    {
      id: "accounts",
      n: "04",
      title: "Authenticatie, accounts & OAuth-federatie",
      blocks: [
        {
          kind: "ul",
          items: [
            "**Accountgegevens:** e-mailadressen, veilige wachtwoordhashes (waar van toepassing) en profielinstellingen.",
            "**Externe SSO:** bij aanmelding via externe identiteitsproviders (zoals GitHub, Google, Apple, GitLab of een eigen OIDC-provider) ontvangt ROUT enkel de noodzakelijke basisgegevens — e-mail en weergavenaam — voor het onderhouden van de sessie.",
            "**Sessie-integriteit:** authenticatiestatus wordt bewaard via geïsoleerde beveiligde cookies en localstorage-tokens. Er staan geen commerciële trackingpixels of externe analytics-scripts op beveiligde endpoints.",
          ],
        },
      ],
    },
    {
      id: "domains",
      n: "05",
      title: "Eigen domeinen & routinginfrastructuur",
      blocks: [
        {
          kind: "p",
          text: "Wanneer verkeer via een eigen domein door ROUT loopt, worden proxy- en routingmetadata uitsluitend gebruikt voor precieze doorverwijzing en SSL-terminatie. IP-tracking van bezoekers op eigen domeinzones staat uit.",
        },
      ],
    },
    {
      id: "api",
      n: "06",
      title: "Programmatische toegang, API-sleutels & rate limiting",
      blocks: [
        {
          kind: "p",
          text: "API-verkeer genereert minimale technische logs — tijdstip, endpoint, statuscode en rate-limitingtellers — enkel bewaard voor infrastructuurbeveiliging, DDoS-afweer en API-stabiliteit.",
        },
      ],
    },
    {
      id: "payments",
      n: "07",
      title: "Micro-betalingen, verificatiekosten & financiële gegevens",
      blocks: [
        {
          kind: "p",
          text: "Betalingen voor accountverificatie of premiumroutering verlopen via gecertificeerde, PCI-DSS-conforme betaalproviders. ROUT bewaart geen kaartgegevens of andere gevoelige financiële instrumenten op eigen infrastructuur.",
        },
      ],
    },
    {
      id: "hosting",
      n: "08",
      title: "Soevereine infrastructuur & hosting (EU)",
      blocks: [
        {
          kind: "p",
          text: "Alle gebruikersgegevens en configuraties worden bewaard in datacenters binnen de Europese Unie op beheerde PostgreSQL-infrastructuur, onder een strikte verwerkersovereenkomst (DPA) met versleuteling tijdens transport en in rust.",
        },
      ],
    },
    {
      id: "rights",
      n: "09",
      title: "Afdwingbare rechten van betrokkenen (AVG hoofdstuk III)",
      variant: "grid",
      cards: [
        {
          title: "Inzage & overdraagbaarheid",
          detail: "Directe export van een machineleesbare kopie van je persoonsgegevens.",
        },
        {
          title: "Rectificatie & wissing",
          detail: "Onmiddellijke selfservice-verwijdering van accounts, links en metadata.",
        },
        {
          title: "Beperking & bezwaar",
          detail:
            "Recht om verwerking op grond van gerechtvaardigd belang te beperken of er bezwaar tegen te maken.",
        },
        {
          title: "Klacht bij de toezichthouder",
          detail:
            "Uitdrukkelijk recht om klacht in te dienen bij de GBA, Drukpersstraat 35, 1000 Brussel.",
        },
      ],
    },
  ],
};

const privacyFr: LegalDoc = {
  title: "Politique de confidentialité",
  updated: "Dernière mise à jour : août 2026 · conforme au RGPD",
  badges: [
    "🇪🇺 Hébergé dans l’UE",
    "🛡️ Aucun traceur publicitaire",
    "⚖️ Conforme au RGPD",
    "🏛️ APD Bruxelles",
  ],
  chips: [
    { id: "controller", label: "Responsable" },
    { id: "static", label: "QR statiques" },
    { id: "dynamic", label: "Statistiques" },
    { id: "accounts", label: "Comptes & SSO" },
    { id: "domains", label: "Domaines" },
    { id: "api", label: "Journaux API" },
    { id: "payments", label: "Paiements" },
    { id: "hosting", label: "Hébergement UE" },
    { id: "rights", label: "Vos droits" },
  ],
  contactCta: "✉️ Demande relative aux données",
  sections: [
    {
      id: "controller",
      n: "01",
      title: "Base légale & responsable du traitement",
      blocks: [
        {
          kind: "p",
          text: "ROUT est exploité comme un projet d’infrastructure indépendant par un créateur individuel établi à Bruxelles, Belgique (UE). Le créateur agit en qualité de **responsable du traitement** pour tous les traitements décrits ici. L’architecture est « zero-trust » par conception : exécution locale d’abord, minimisation des données, transparence totale sur ce qui quitte votre appareil.",
        },
        {
          kind: "p",
          text: "Canal de contact pour toute question de confidentialité : contact@rout.be. Délai légal : nous répondons aux demandes des personnes concernées **dans un délai d’un mois calendrier**, conformément à l’article 12 du RGPD.",
        },
        {
          kind: "p",
          text: "Autorité de contrôle compétente : **Autorité de protection des données (APD) / Gegevensbeschermingsautoriteit (GBA)**, rue de la Presse 35, 1000 Bruxelles, Belgique.",
        },
      ],
    },
    {
      id: "static",
      n: "02",
      title: "QR codes statiques — architecture zéro donnée",
      variant: "ok",
      blocks: [
        {
          kind: "p",
          text: "Les QR codes statiques sont générés entièrement côté client, dans le bac à sable local de votre navigateur. Leur contenu — URL, vCards, clés Wi-Fi, IBAN — n’atteint jamais les serveurs ROUT, n’est jamais intercepté et ne produit aucun journal serveur ni télémétrie résiduelle. Rien n’est téléversé : il n’y a donc rien à stocker, divulguer ou perdre.",
        },
      ],
    },
    {
      id: "dynamic",
      n: "03",
      title: "Routage dynamique, liens courts & statistiques anonymes",
      blocks: [
        {
          kind: "ul",
          items: [
            "**Nécessité contractuelle (art. 6(1)(b) RGPD) :** nous traitons les URL de destination uniquement pour exécuter les redirections demandées.",
            "**Intérêt légitime (art. 6(1)(f) RGPD) :** collecte de métadonnées de scan grossières et strictement anonymisées — horodatage, pays et catégorie d’appareil.",
            "**Garanties strictes :** les adresses IP complètes ne sont jamais journalisées ni stockées. Le fingerprinting est désactivé. Aucun profilage publicitaire ni suivi intersites.",
            "**Cycle de vie :** les statistiques sont liées au lien dynamique — sa suppression efface instantanément les données agrégées.",
          ],
        },
      ],
    },
    {
      id: "accounts",
      n: "04",
      title: "Authentification, comptes & fédération OAuth",
      blocks: [
        {
          kind: "ul",
          items: [
            "**Données de compte :** adresses e-mail, empreintes de mots de passe sécurisées (le cas échéant) et configuration de profil.",
            "**SSO externe :** lors d’une authentification via un fournisseur d’identité externe (GitHub, Google, Apple, GitLab ou OIDC personnalisé), ROUT ne récupère que les identifiants essentiels — e-mail et nom affiché — pour maintenir la session.",
            "**Intégrité de session :** l’état d’authentification est conservé via des cookies sécurisés isolés et des jetons en stockage local. Aucun pixel de suivi commercial ni script d’analyse tiers sur les points d’accès authentifiés.",
          ],
        },
      ],
    },
    {
      id: "domains",
      n: "05",
      title: "Domaines personnalisés & routage",
      blocks: [
        {
          kind: "p",
          text: "Lorsque le trafic transite par un domaine personnalisé relié à ROUT, les métadonnées de proxy et de routage servent uniquement à la redirection précise et à la terminaison SSL. Le suivi des IP visiteurs est désactivé sur ces zones.",
        },
      ],
    },
    {
      id: "api",
      n: "06",
      title: "Accès programmatique, clés API & limitation de débit",
      blocks: [
        {
          kind: "p",
          text: "Les appels API génèrent des journaux techniques minimaux — horodatage, URI, statut de réponse et compteurs de limitation — conservés uniquement pour la sécurité de l’infrastructure, la défense anti-DDoS et la stabilité de l’API.",
        },
      ],
    },
    {
      id: "payments",
      n: "07",
      title: "Micro-paiements, frais de vérification & données financières",
      blocks: [
        {
          kind: "p",
          text: "Les transactions liées à la vérification de compte ou aux offres premium sont traitées par des prestataires de paiement certifiés PCI-DSS. ROUT ne stocke aucune donnée de carte bancaire ni instrument financier sensible sur son infrastructure.",
        },
      ],
    },
    {
      id: "hosting",
      n: "08",
      title: "Infrastructure souveraine & hébergement (UE)",
      blocks: [
        {
          kind: "p",
          text: "Toutes les données et configurations sont stockées dans des centres de données de l’Union européenne, sur une infrastructure PostgreSQL managée, sous un accord de sous-traitance (DPA) strict, avec chiffrement en transit et au repos.",
        },
      ],
    },
    {
      id: "rights",
      n: "09",
      title: "Droits des personnes concernées (RGPD chapitre III)",
      variant: "grid",
      cards: [
        {
          title: "Accès & portabilité",
          detail: "Export immédiat d’une copie lisible par machine de vos données personnelles.",
        },
        {
          title: "Rectification & effacement",
          detail: "Suppression en libre-service des comptes, liens et métadonnées associées.",
        },
        {
          title: "Limitation & opposition",
          detail:
            "Droit de limiter le traitement fondé sur l’intérêt légitime ou de s’y opposer à tout moment.",
        },
        {
          title: "Recours auprès de l’autorité",
          detail:
            "Droit explicite d’introduire une plainte auprès de l’APD, rue de la Presse 35, 1000 Bruxelles.",
        },
      ],
    },
  ],
};

const TERMS: Partial<Record<LegalLocale, LegalDoc>> = { en: termsEn, nl: termsNl, fr: termsFr };
const PRIVACY: Partial<Record<LegalLocale, LegalDoc>> = {
  en: privacyEn,
  nl: privacyNl,
  fr: privacyFr,
};

/** Falls back to English whenever a locale has no translation yet. */
export function getTerms(locale: LegalLocale): LegalDoc {
  return TERMS[locale] ?? termsEn;
}

export function getPrivacy(locale: LegalLocale): LegalDoc {
  return PRIVACY[locale] ?? privacyEn;
}
