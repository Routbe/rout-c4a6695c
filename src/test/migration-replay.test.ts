// @vitest-environment node
/**
 * CI replay: every migration, in runner order, on an empty Postgres (PGlite),
 * must succeed and produce exactly db/schema.snapshot.json. The live side is
 * checked with `bun scripts/schema-snapshot.ts --check`.
 */
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listMigrationFiles, planMigrations } from "../../scripts/migration-plan";
import { diffCatalogs, readCatalog, type Catalog } from "../../scripts/schema-catalog";

const DB_DIR = join(__dirname, "..", "..", "db");

describe("migrations on an empty database", () => {
  it("apply in order and match the committed schema snapshot", async () => {
    const db = new PGlite({ extensions: { pgcrypto, btree_gist } });
    const ran: string[] = [];
    for (const step of planMigrations(listMigrationFiles(DB_DIR), new Set())) {
      if (step.action !== "run") continue;
      const body = readFileSync(join(DB_DIR, step.file), "utf8");
      try {
        await db.exec(`begin;\n${body}\n;commit;`);
      } catch (error) {
        await db.exec("rollback").catch(() => undefined);
        throw new Error(`${step.file}: ${error instanceof Error ? error.message : String(error)}`);
      }
      ran.push(step.file);
    }
    expect(ran[0]).toBe("0000_baseline.sql");

    const replayed = await readCatalog(async (q) => (await db.query<Record<string, unknown>>(q)).rows);
    const committed = JSON.parse(readFileSync(join(DB_DIR, "schema.snapshot.json"), "utf8")) as Catalog;
    expect(diffCatalogs(committed, replayed)).toEqual([]);
    await db.close();
  }, 240_000);
});
