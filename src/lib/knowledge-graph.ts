/**
 * ROUT's Schema.org knowledge graph, rendered once in the root head so every
 * ROUT page (not member pages) tells search engines and AI crawlers the same
 * thing: who publishes ROUT and what ROUT OS is.
 *
 * Only list technologies this codebase actually runs on.
 */
import { KNOWLEDGE_GRAPH_SCRIPT_ID } from "@/lib/page-title";

export const SITE_URL = "https://rout.be";
export const AGPL_LICENSE_URL = "https://www.gnu.org/licenses/agpl-3.0.html";
export const FOUNDER_NAME = "Jona Zeno Delplanche";

export const SEO_KEYWORDS = [
  "digital identity",
  "edge routing",
  "privacy proxy",
  FOUNDER_NAME,
  "sovereign OS",
  "developer infrastructure",
  "OpenID Connect",
  "passkeys",
  "AGPLv3",
] as const;

export const ORGANIZATION_DESCRIPTION =
  "Europese open-source infrastructuur voor digitale identiteit, privacy-proxying en routing.";

export const TECHNOLOGIES = [
  "TanStack Start (React)",
  "Edge runtime (Cloudflare Workers)",
  "Edge KV-ready link cache",
  "Passkeys (WebAuthn)",
  "OpenID Connect",
  "PostgreSQL (Neon) with row-level security",
] as const;

export function routKnowledgeGraph() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: "ROUT",
        alternateName: "ROUT - Sovereign Digital Identity OS",
        url: SITE_URL,
        inLanguage: ["nl", "en", "fr", "de"],
        publisher: { "@id": `${SITE_URL}/#org` },
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#org`,
        name: "ROUT",
        url: SITE_URL,
        logo: { "@type": "ImageObject", url: `${SITE_URL}/icon-512.png` },
        description: ORGANIZATION_DESCRIPTION,
        founder: { "@id": `${SITE_URL}/#founder` },
        foundingLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressRegion: "Europe" } },
        knowsAbout: ["Digital identity", "Privacy proxying", "Edge routing", "OpenID Connect", "Passkeys"],
        sameAs: ["https://github.com/routbe", "https://bsky.app/profile/rout.be", "https://mastodon.social/@routbe"],
      },
      {
        "@type": "Person",
        "@id": `${SITE_URL}/#founder`,
        name: FOUNDER_NAME,
        url: "https://delplanche.cloud",
        jobTitle: "Founder",
        worksFor: { "@id": `${SITE_URL}/#org` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#app`,
        name: "ROUT OS",
        alternateName: "ROUT",
        url: SITE_URL,
        description:
          "Sovereign Digital Identity OS: one verified identity, Login with ROUT for third-party apps, private email relays per app, workspaces, a headless API and edge-resolved short links and QR codes — hosted in the EU, without trackers.",
        applicationCategory: ["DeveloperApplication", "SecurityApplication"],
        applicationSubCategory: "Digital identity & routing infrastructure",
        operatingSystem: "Web, Edge",
        inLanguage: ["nl", "en", "fr", "de"],
        license: AGPL_LICENSE_URL,
        isAccessibleForFree: true,
        softwareRequirements: TECHNOLOGIES.join(", "),
        keywords: SEO_KEYWORDS.join(", "),
        featureList: [
          "Verified sovereign digital identity",
          "Login with ROUT (OpenID Connect provider)",
          "Private email relays per connected app",
          "Passkey sign-in",
          "Workspaces with team roles",
          "Headless API and developer console",
          "Edge-resolved short links and dynamic QR codes",
        ],
        offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
        author: { "@id": `${SITE_URL}/#founder` },
        creator: { "@id": `${SITE_URL}/#founder` },
        publisher: { "@id": `${SITE_URL}/#org` },
      },
      {
        "@type": "SoftwareSourceCode",
        "@id": `${SITE_URL}/#source`,
        name: "ROUT OS source code",
        codeRepository: "https://github.com/routbe",
        license: AGPL_LICENSE_URL,
        programmingLanguage: "TypeScript",
        runtimePlatform: "Edge (Cloudflare Workers)",
        author: { "@id": `${SITE_URL}/#founder` },
        targetProduct: { "@id": `${SITE_URL}/#app` },
      },
    ],
  };
}

/** Ready for a route `head().scripts`. */
export function knowledgeGraphScripts() {
  return [
    { type: "application/ld+json", id: KNOWLEDGE_GRAPH_SCRIPT_ID, children: JSON.stringify(routKnowledgeGraph()) },
  ];
}
