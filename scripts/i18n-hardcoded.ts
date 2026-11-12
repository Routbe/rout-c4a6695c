/** Heuristic scan for hard-coded UI text (JSX text, placeholder/aria-label/title) in components and pages. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src/components", "src/routes"].filter((r) => { try { return statSync(r).isDirectory(); } catch { return false; } });
const ATTR = /\b(placeholder|aria-label|title)="([^"{]*[A-Za-zÀ-ÿ]{3,}[^"]*)"/g;
const TEXT = />\s*([A-Za-zÀ-ÿ][^<>{}]{2,})\s*</g;
const files: string[] = [];
const walk = (d: string) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".tsx") && !p.includes("/ui/")) files.push(p);
  }
};
ROOTS.forEach(walk);
let total = 0;
for (const f of files) {
  const s = readFileSync(f, "utf8");
  const hits = [...s.matchAll(ATTR)].map((m) => m[2]).concat([...s.matchAll(TEXT)].map((m) => m[1].trim()));
  if (hits.length) {
    total += hits.length;
    console.log(`${f}: ${hits.length}`);
  }
}
console.log(`total: ${total}`);
