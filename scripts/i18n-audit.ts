/** Lists translation keys missing in any of NL/EN/FR/DE. Exits 1 when something is missing. */
import { readFileSync, readdirSync } from "node:fs";

const LOCALES = ["nl", "en", "fr", "de"] as const;
/** Main bundle plus area bundles (merged in src/lib/i18n.tsx). */
const AREAS = ["", "auth/", "studio/", "ai/"];
const read = (p: string) => JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
const dicts = Object.fromEntries(
  LOCALES.map((l) => [l, Object.assign({}, ...AREAS.map((a) => read(`src/locales/${a}${l}.json`)), ...readdirSync("src/locales/pages").filter((f) => f.endsWith(`.${l}.json`)).map((f) => read(`src/locales/pages/${f}`)))]),
);
const all = new Set(LOCALES.flatMap((l) => Object.keys(dicts[l])));
let missing = 0;
for (const l of LOCALES) {
  const gaps = [...all].filter((k) => !(k in dicts[l]) || dicts[l][k] === "");
  missing += gaps.length;
  console.log(`${l}: ${gaps.length} missing`);
  for (const k of gaps.slice(0, 50)) console.log(`  - ${k}`);
}
process.exit(missing ? 1 : 0);
