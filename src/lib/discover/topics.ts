/**
 * Discover landing pages: one branded page per ROUT product line.
 * Locale-independent metadata lives here; copy lives in copy.<locale>.ts.
 */
export const TOPIC_SLUGS = [
  "profiles",
  "qr-studio",
  "links",
  "rout-id",
  "rout-card",
  "creator-support",
  "questions",
  "workspaces",
  "developers",
  "bookings",
] as const;
export type TopicSlug = (typeof TOPIC_SLUGS)[number];

export function isTopicSlug(value: string): value is TopicSlug {
  return (TOPIC_SLUGS as readonly string[]).includes(value);
}

/** Home page chapter key → discover page. */
export const CHAPTER_TOPIC = {
  profile: "profiles",
  qr: "qr-studio",
  analytics: "links",
  identity: "rout-id",
  wallet: "rout-card",
  commerce: "creator-support",
  social: "questions",
  workspace: "workspaces",
  developer: "developers",
} as const satisfies Record<string, TopicSlug>;

/** Share-card accents: sRGB of the --tp/--tp2 pair in styles/discover.css (resvg has no oklch). */
export const TOPIC_CARD_ACCENT: Record<TopicSlug, readonly [string, string]> = {
  profiles: ["#5CE4B1", "#4FCDCD"],
  "qr-studio": ["#C0EF5C", "#75DF8F"],
  links: ["#58DBF8", "#40D9C1"],
  "rout-id": ["#92C9FF", "#A3DCE7"],
  "rout-card": ["#E9CA89", "#BD9F7C"],
  "creator-support": ["#FF976A", "#FFBB65"],
  questions: ["#FF719E", "#FF9F4C"],
  workspaces: ["#CBAAFF", "#92C1FD"],
  developers: ["#6EF593", "#59D7B9"],
  bookings: ["#E989E1", "#FEB6D1"],
};

/** One fixed code-drawn preview card per product page and locale. */
export function topicCardImage(slug: TopicSlug, locale: string, origin = "https://rout.be") {
  return `${origin}/brand/og/discover-${slug}-${locale}.png`;
}

export type TopicMeta = {
  /** Where the main button goes: a page that works without signing in where one exists. */
  primary: string;
  /** Detail pages, in order; labels come from the locale copy. */
  docs: readonly string[];
};

export const TOPICS: Record<TopicSlug, TopicMeta> = {
  profiles: { primary: "/explore", docs: ["/info/profiles", "/product/profile-hub", "/info/integrations", "/info/guestbook", "/info/bookings", "/info/usernames"] },
  "qr-studio": { primary: "/qr-code-generator", docs: ["/info/qr-studio", "/qr-code-generator", "/features/design-studio", "/product/batch-engine"] },
  links: { primary: "/info/links-and-analytics", docs: ["/info/links-and-analytics", "/features/link-management", "/features/cookieless-analytics", "/product/dynamic-links", "/product/custom-domains"] },
  "rout-id": { primary: "/info/sign-in-with-rout", docs: ["/info/sign-in-with-rout", "/info/connected-apps", "/info/human-verification", "/info/account-security", "/info/email-forwarding", "/developer/identity-oauth"] },
  "rout-card": { primary: "/about/rout-card", docs: ["/about/rout-card", "/info/wallet", "/info/badges", "/info/account-security"] },
  "creator-support": { primary: "/info/tips", docs: ["/info/tips", "/info/payment-pages", "/info/bookings", "/info/referrals"] },
  questions: { primary: "/info/anonymous-questions", docs: ["/info/anonymous-questions", "/info/answers-and-stories", "/about/anonymous-questions", "/info/parental-consent"] },
  workspaces: { primary: "/solutions/agencies", docs: ["/solutions/agencies", "/product/custom-domains", "/features/asset-manager", "/features/design-studio"] },
  developers: { primary: "/developers", docs: ["/developers", "/developer/identity-oauth", "/developer/ai-mcp", "/developer/webhooks", "/developer/credentials", "/about/open-source"] },
  bookings: { primary: "/info/bookings", docs: ["/info/bookings", "/info/profiles", "/solutions/agencies"] },
};

export type TopicCopy = {
  /** Product-line name shown as the brand, e.g. "ROUT Card". */
  brand: string;
  title: string;
  lead: string;
  primary: string;
  /** Four short labels floating around the hero visual. */
  chips: readonly [string, string, string, string];
  /** Open standards or services the topic works with (text only, no logos). */
  works: readonly string[];
  features: readonly [Feature, Feature, Feature, Feature];
  steps: readonly [Feature, Feature, Feature];
  faq: readonly { q: string; a: string }[];
  final: { title: string; text: string };
  /** Labels for TOPICS[slug].docs, same order. */
  docs: readonly string[];
};
type Feature = { title: string; text: string };

export type DiscoverUi = {
  kicker: string;
  indexTitle: string;
  indexLead: string;
  readMore: string;
  allTopics: string;
  worksWith: string;
  featuresLabel: string;
  stepsLabel: string;
  stepsTitle: string;
  faqLabel: string;
  docsLabel: string;
  docsTitle: string;
  claim: string;
  next: string;
  homeMarquee: string;
};

export type DiscoverCopy = { ui: DiscoverUi; topics: Record<TopicSlug, TopicCopy> };

/**
 * The product line a detail page belongs to, if any: the topic whose main page
 * it is wins, otherwise the first topic that lists it (TOPICS order).
 */
export function topicForPath(path: string): TopicSlug | null {
  const own = TOPIC_SLUGS.find((slug) => TOPICS[slug].primary === path);
  if (own) return own;
  for (const slug of TOPIC_SLUGS) {
    const meta = TOPICS[slug];
    if (meta.primary === path || meta.docs.includes(path)) return slug;
  }
  return null;
}
