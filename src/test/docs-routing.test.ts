// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { compile } from "@mdx-js/mdx";
import remarkFrontmatter from "remark-frontmatter";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";
import { parse } from "yaml";
import { expect, it } from "vitest";

it("every bundled MDX article has the required frontmatter and compiles with global React components", async () => {
  for (const category of ["about", "info", "dev", "safety"]) {
    for (const file of readdirSync(`src/content/${category}`)) {
      const source = readFileSync(`src/content/${category}/${file}`, "utf8");
      const block = /^---\n([\s\S]*?)\n---/.exec(source)?.[1];
      if (!block) throw new Error(`Missing frontmatter ${file}`);
      const metadata = parse(block);
      expect(metadata.category).toBe(category);
      expect(metadata.title.length).toBeGreaterThan(0);
      expect(metadata.description.length).toBeGreaterThan(0);
      expect(metadata.last_updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(metadata.ai_ready).toBe(true);
      await compile(source, { providerImportSource: "@mdx-js/react", remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter] });
    }
  }
}, 30_000);
for (const pillar of ["about", "info", "dev", "safety"]) {
  it(`/${pillar} returns HTTP 200 from the running app`, async () => {
    const response = await fetch(`http://localhost:8080/${pillar}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
  }, 30_000);
}