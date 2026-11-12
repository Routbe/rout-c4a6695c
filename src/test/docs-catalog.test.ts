import { expect, it } from "vitest";
import { docs, docsInCategory, getDoc, parseDoc } from "@/lib/docs-catalog";

const source = (category = "about", content = "# Example\n\n## Visible\n") => `---\ntitle: Example\ndescription: A precise summary.\ncategory: ${category}\nlast_updated: "2026-10-31"\nai_ready: true\n---\n${content}`;

it("requires the six requested frontmatter values", () => {
  const article = parseDoc(source(), "/src/content/about/index.mdx");
  expect(article).toMatchObject({ title: "Example", description: "A precise summary.", category: "about", last_updated: "2026-10-31", ai_ready: true, path: "/about" });
  for (const field of ["title", "description", "category", "last_updated", "ai_ready"]) {
    expect(() => parseDoc(source().replace(new RegExp(`^${field}:.*\\n`, "m"), ""), "/src/content/about/index.mdx")).toThrow();
  }
});

it("rejects mismatched content categories", () => {
  expect(() => parseDoc(source(), "/src/content/about-other/example.mdx")).toThrow("Wrong category");
});

it("includes actual H2 and H3 chapters, not headings inside code examples", () => {
  const article = parseDoc(source("about", "# Example\n## Visible\n```md\n## Not a chapter\n```\n### Details\n"), "/src/content/about/index.mdx");
  expect(article.headings).toEqual([{ id: "visible", text: "Visible", level: 2 }, { id: "details", text: "Details", level: 3 }]);
});

it("covers the exhaustive four-pillar sitemap", () => {
  const expected = {
    about: ["", "manifesto", "ecosystem", "open-source", "brand", "sovereignty"],
    info: ["", "profiles", "usernames", "badges", "credentials", "qr-studio", "wallet", "account-security", "custom-badges", "account-merge"],
    dev: ["", "get-started", "identity-oidc", "credentials-api", "webhooks", "ai-mcp", "design-system", "identity", "credentials"],
    safety: ["", "architecture", "cryptography", "compliance", "transparency", "privacy", "terms", "data-deletion", "security-advisories", "zero-knowledge"],
  };
  const paths = docs.map(doc => doc.path);
  for (const [category, slugs] of Object.entries(expected)) for (const slug of slugs) expect(paths).toContain(`/${category}${slug ? `/${slug}` : ""}`);
  expect(new Set(paths).size).toBe(paths.length);
});

it("orders pillar overviews before their introduction and technical articles", () => {
  expect(docsInCategory("about").slice(0, 2).map(doc => doc.path)).toEqual(["/about", "/about/manifesto"]);
  expect(docsInCategory("dev").slice(0, 3).map(doc => doc.path)).toEqual(["/dev", "/dev/get-started", "/dev/identity-oidc"]);
});

it("provides all ten About articles in Dutch, English, French and German without duplicate canonical entries", () => {
  const slugs = ["", "manifesto", "platform", "rout-card", "anonymous-questions", "responsible-ai", "ecosystem", "sovereignty", "open-source", "brand"];
  for (const locale of ["nl", "en", "fr", "de"] as const) {
    for (const slug of slugs) {
      const path = `/about${slug ? `/${slug}` : ""}`;
      expect(getDoc(path, locale)?.locale).toBe(locale);
      expect(docs.filter(doc => doc.path === path)).toHaveLength(1);
    }
  }
});