// @vitest-environment node
/**
 * DDL freeze (RFC-001 §1.3): the app never changes the schema at runtime.
 * Every create/alter/drop lives in db/NNNN_*.sql.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");
// Documentation pages may show example SQL as text; they never execute it.
const DOC_PAGES = new Set(["routes/developers.tsx"]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const DDL_IN_SQL_TEMPLATE = /sql(?:\.unsafe\()?`\s*(create|alter|drop|truncate|grant|revoke|comment\s+on)\b/i;

describe("no runtime DDL", () => {
  it("no sql`` template in src/ starts with a schema-changing statement", () => {
    const offenders = walk(SRC)
      .filter((file) => !DOC_PAGES.has(relative(SRC, file).replace(/\\/g, "/")))
      .filter((file) => DDL_IN_SQL_TEMPLATE.test(readFileSync(file, "utf8")))
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  it("the old runSchemaEnsure safety net is gone", () => {
    const users = walk(SRC).filter((file) => readFileSync(file, "utf8").includes("runSchemaEnsure"));
    expect(users.map((f) => relative(SRC, f))).toEqual([]);
  });
});
