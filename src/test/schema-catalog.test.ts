// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalCheck, diffCatalogs, renderDbTypes, tsTypeFor, type Catalog } from "../../scripts/schema-catalog";

const snapshot = JSON.parse(readFileSync(join(__dirname, "..", "..", "db", "schema.snapshot.json"), "utf8")) as Catalog;

describe("schema drift detection", () => {
  it("reports a missing column", () => {
    const changed = structuredClone(snapshot);
    const t = changed.tables.find((x) => x.schema === "public" && x.name === "oauth_signing_keys")!;
    t.columns = t.columns.filter((c) => c.name !== "private_jwk_sealed");
    expect(diffCatalogs(snapshot, changed)).toContain("- column public.oauth_signing_keys private_jwk_sealed (missing)");
  });

  it("reports an unexpected table", () => {
    const changed = structuredClone(snapshot);
    changed.tables.push({ ...changed.tables[0]!, name: "zz_unexpected" });
    expect(diffCatalogs(snapshot, changed)).toContain(`+ table ${changed.tables[0]!.schema}.zz_unexpected (unexpected)`);
  });

  it("treats AND-grouping differences between Postgres versions as equal", () => {
    expect(canonicalCheck("CHECK ((((a >= 5) AND (a <= 480)) AND ((a % 5) = 0)))")).toBe(
      canonicalCheck("CHECK (((a >= 5) AND (a <= 480) AND ((a % 5) = 0)))"),
    );
  });
});

describe("generated row types", () => {
  it("maps Postgres types to the values the drivers return", () => {
    const enums = new Map([["workspace_role", "PublicWorkspaceRole"]]);
    expect(tsTypeFor("integer", enums)).toBe("number");
    expect(tsTypeFor("bigint", enums)).toBe("string");
    expect(tsTypeFor("text[]", enums)).toBe("Array<string>");
    expect(tsTypeFor("jsonb", enums)).toBe("JsonValue");
    expect(tsTypeFor("timestamp with time zone", enums)).toBe("string | Date");
    expect(tsTypeFor("workspace_role", enums)).toBe("PublicWorkspaceRole");
  });

  it("src/lib/db-types.gen.ts is in sync with db/schema.snapshot.json", () => {
    const committed = readFileSync(join(__dirname, "..", "lib", "db-types.gen.ts"), "utf8");
    expect(committed).toBe(renderDbTypes(snapshot));
  });
});
