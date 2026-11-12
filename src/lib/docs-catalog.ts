import { parse } from "yaml";
import { z } from "zod";
import sources from "virtual:rout-docs";
import { canonicalLink, SITE_ORIGIN } from "@/lib/site";
import type { Locale } from "@/lib/i18n";
import { pageCardImage, type PageKey } from "@/lib/page-cards";
import { pathCardImage, SECTION_ACCENT } from "@/lib/path-cards";

export const DOC_CATEGORIES = ["about", "info", "dev", "safety", "qr-code-generator", "product", "features", "solutions", "compare", "guide", "support"] as const;
export type DocCategory = typeof DOC_CATEGORIES[number];
export const DOC_LABELS: Record<DocCategory, string> = { about: "De missie", info: "ROUT gebruiken", dev: "Developers", safety: "Trust & Safety", "qr-code-generator": "QR-code generator", product: "Product", features: "Mogelijkheden", solutions: "Oplossingen", compare: "Vergelijkingen", guide: "Ontwerp & drukwerk", support: "Account & workspaces" };
const schema = z.object({ title: z.string().min(1), description: z.string().min(1), category: z.enum(DOC_CATEGORIES), last_updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), ai_ready: z.literal(true), seo_title: z.string().optional(), seo_description: z.string().optional(), seo_keywords: z.array(z.string()).optional(), schema_type: z.enum(["WebApplication", "SoftwareApplication", "HowTo", "Article"]).optional(), qr_type: z.string().optional(), steps: z.array(z.object({ title: z.string(), text: z.string() })).optional(), faqs: z.array(z.object({ question: z.string(), answer: z.string() })).optional() });
export type DocEntry = z.infer<typeof schema> & { path: string; locale: Locale; source: string; headings: { id: string; text: string; level: number }[] };
export const headingId = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export function parseDoc(source: string, file: string): DocEntry {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(source);
  if (!match?.[1]) throw new Error(`Missing frontmatter: ${file}`);
  const meta = schema.parse(parse(match[1]));
  const locale = (/\.(en|fr|de)\.mdx$/.exec(file)?.[1] ?? "nl") as Locale;
  const relative = file.replace(/^.*\/content\//, "").replace(/\.(en|fr|de)\.mdx$/, ".mdx").replace(/\.mdx$/, "");
  const path = `/${relative.replace(/\/index$/, "")}`;
  if (path !== `/${meta.category}` && !path.startsWith(`/${meta.category}/`)) throw new Error(`Wrong category: ${file}`);
  const seen = new Map<string, number>();
  const body = source.slice(match[0].length).replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "");
  const headings = [...body.matchAll(/^(#{2,3}) (.+)$/gm)].map(m => {
    const text = (m[2] ?? "").replace(/[`*_]/g, "");
    const base = headingId(text); const count = seen.get(base) ?? 0; seen.set(base, count + 1);
    return { id: count ? `${base}-${count}` : base, text, level: m[1]?.length ?? 2 };
  });
  return { ...meta, path, locale, source, headings };
}
const localizedDocs = Object.entries(sources).map(([file, source]) => parseDoc(source, file));
export const docs = localizedDocs.filter(doc => doc.locale === "nl");
export function getDoc(path: string, locale: Locale = "nl") { return localizedDocs.find(d => d.path === path && d.locale === locale) ?? docs.find(d => d.path === path); }
const articleOrder: Partial<Record<DocCategory, string[]>> = {
  about: ["index", "manifesto", "platform", "rout-card", "anonymous-questions", "responsible-ai", "ai-agents", "ecosystem", "sovereignty", "open-source", "brand"],
  info: ["index", "sign-in-with-rout", "connected-apps", "no-account-lists", "human-verification", "profiles", "payment-pages", "integrations", "links-and-analytics", "anonymous-questions", "answers-and-stories", "ghost-mode", "usernames", "badges", "custom-badges", "credentials", "qr-studio", "wallet", "tips", "guestbook", "bookings", "newsletter", "email-forwarding", "referrals", "account-security", "account-merge", "parental-consent"],
  dev: ["index", "get-started", "identity-oidc", "identity", "graduated-consent", "blind-hash-matching", "email-sync-webhooks", "credentials-api", "credentials", "webhooks", "ai-mcp", "design-system"],
  safety: ["index", "anonymous-questions", "architecture", "cryptography", "zero-knowledge", "compliance", "transparency", "privacy", "terms", "data-deletion", "security-advisories"],
};
export function docsInCategory(category: DocCategory, locale: Locale = "nl") {
  const rank = (doc: DocEntry) => { const slug = doc.path === `/${category}` ? "index" : doc.path.split("/").at(-1) ?? ""; const position = (articleOrder[category] ?? ["index"]).indexOf(slug); return position < 0 ? Number.MAX_SAFE_INTEGER : position; };
  return docs.filter(d => d.category === category).map(d => getDoc(d.path, locale) ?? d).sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));
}
/** The code-drawn ROUT card closest to a doc page (one fixed card per section and locale). */
export function docCardKey(path: string): PageKey {
  if (path === "/about/sovereignty" || path === "/sovereignty") return "sovereignty";
  if (path === "/safety/privacy" || path === "/privacy") return "privacy";
  if (path === "/safety/terms" || path === "/terms") return "terms";
  if (path === "/about" || path.startsWith("/about/")) return "about";
  return "home";
}
/** Fixed page cards for the pages that have their own; every other doc page gets its own section-coloured card. */
export function docCardImage(path: string, locale: Locale = "nl") {
  const key = docCardKey(path);
  return key === "home" || (key === "about" && path !== "/about") ? pathCardImage(path, locale) : pageCardImage(key, locale);
}
export function docHead(path: string, locale: Locale = "nl") {
  const doc = getDoc(path, locale);
  const title = doc?.seo_title ?? `${doc?.title ?? "Documentatie"} — ROUT`;
  const description = doc?.seo_description ?? doc?.description ?? "ROUT-documentatie";
  return { meta: [{ title }, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "article" }, { property: "og:url", content: `${SITE_ORIGIN}${path}` }, { property: "og:image", content: docCardImage(path, locale) }, { property: "og:image:width", content: "1200" }, { property: "og:image:height", content: "630" }, { name: "twitter:card", content: "summary_large_image" }, { name: "twitter:image", content: docCardImage(path, locale) }, { name: "theme-color", content: SECTION_ACCENT[doc?.category ?? "info"] ?? "#C9A84C" }, ...(doc?.seo_keywords ? [{ name: "keywords", content: doc.seo_keywords.join(", ") }] : [])], links: [canonicalLink(path)], scripts: doc ? [{ type: "application/ld+json", children: JSON.stringify(docStructuredData(doc)).replace(/</g, "\\u003c") }] : [] };
}

export function docStructuredData(doc: DocEntry) {
  const url = `${SITE_ORIGIN}${doc.path}`;
  const primary: Record<string, unknown> = { "@type": doc.schema_type ?? "Article", "@id": `${url}#article`, name: doc.title, description: doc.description, url, inLanguage: doc.locale, dateModified: doc.last_updated, publisher: { "@type": "Organization", name: "ROUT", url: SITE_ORIGIN } };
  if (doc.schema_type === "HowTo") primary.step = (doc.steps ?? []).map((step, index) => ({ "@type": "HowToStep", position: index + 1, name: step.title, text: step.text, url: `${url}#stap-${index + 1}` }));
  if (doc.schema_type === "WebApplication" || doc.schema_type === "SoftwareApplication") Object.assign(primary, { applicationCategory: "UtilitiesApplication", operatingSystem: "Web", offers: { "@type": "Offer", price: "0", priceCurrency: "EUR", description: "Lokale statische QR-generatie" } });
  const graph: Record<string, unknown>[] = [primary];
  if (doc.faqs?.length) graph.push({ "@type": "FAQPage", "@id": `${url}#faq`, mainEntity: doc.faqs.map(faq => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })) });
  return { "@context": "https://schema.org", "@graph": graph };
}