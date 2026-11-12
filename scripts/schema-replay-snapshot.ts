/**
 * Offline snapshot: replay every migration on PGlite (same order as the
 * runners) and write db/schema.snapshot.json + src/lib/db-types.gen.ts.
 *
 *   bun scripts/schema-replay-snapshot.ts
 *
 * Use when no live database is reachable; afterwards confirm the live side
 * with `bun scripts/schema-snapshot.ts --check`.
 */
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listMigrationFiles, planMigrations } from "./migration-plan";
import { catalogJson, readCatalog, renderDbTypes } from "./schema-catalog";

const root = join(import.meta.dir, "..");
const DB_DIR = join(root, "db");

const db = new PGlite({ extensions: { pgcrypto, btree_gist } });
for (const step of planMigrations(listMigrationFiles(DB_DIR), new Set())) {
  if (step.action !== "run") continue;
  const body = readFileSync(join(DB_DIR, step.file), "utf8");
  try {
    await db.exec(`begin;\n${body}\n;commit;`);
  } catch (error) {
    throw new Error(`${step.file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
const catalog = await readCatalog(async (q) => (await db.query<Record<string, unknown>>(q)).rows);
writeFileSync(join(DB_DIR, "schema.snapshot.json"), catalogJson(catalog));
writeFileSync(join(root, "src", "lib", "db-types.gen.ts"), renderDbTypes(catalog));
await db.close();
console.log("snapshot + types written from replay");
