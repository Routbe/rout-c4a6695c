import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { readdirSync, readFileSync } from "node:fs";
import mdx from "@mdx-js/rollup";
import remarkFrontmatter from "remark-frontmatter";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";

export default defineConfig({
  plugins: [{
    name: "rout-docs-test-catalog",
    resolveId(id) { if (id === "virtual:rout-docs") return "\0virtual:rout-docs"; },
    load(id) {
      if (id !== "\0virtual:rout-docs") return;
      const sources: Record<string, string> = {};
      const visit = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const file = `${dir}/${entry.name}`;
          if (entry.isDirectory()) visit(file);
          else if (file.endsWith(".mdx")) sources[`/${file}`] = readFileSync(file, "utf8");
        }
      };
      visit("src/content");
      return `export default ${JSON.stringify(sources)}`;
    },
  }, mdx({ include: /\.mdx$/, providerImportSource: "@mdx-js/react", remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter] }), react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
