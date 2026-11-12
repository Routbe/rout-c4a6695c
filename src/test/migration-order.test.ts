import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BASELINE_COVERS,
  BASELINE_FILE,
  checksumDrift,
  duplicatePrefixes,
  listMigrationFiles,
  orderMigrationFiles,
  planMigrations,
  splitSql,
} from "../../scripts/migration-plan";

const DB_DIR = join(__dirname, "..", "..", "db");

describe("migration order (F1)", () => {
  it("sorts on the numeric prefix, not as text", () => {
    expect(orderMigrationFiles(["100_c.sql", "10_b.sql", "9_a.sql", "0111_d.sql", "notes.md"])).toEqual([
      "9_a.sql",
      "10_b.sql",
      "100_c.sql",
      "0111_d.sql",
    ]);
  });

  it("runs 10..99 before 100..110 in the real db/ folder", () => {
    const files = listMigrationFiles(DB_DIR);
    expect(files.indexOf("99_issued_credentials.sql")).toBeLessThan(files.indexOf("100_integration_verified_at.sql"));
    expect(files.indexOf("33_booking_requests.sql")).toBeLessThan(files.indexOf("104_booking_engine.sql"));
    expect(files.indexOf("110_booking_custom_fields.sql")).toBeLessThan(files.indexOf("0111_runtime_ddl_freeze.sql"));
    expect(files[0]).toBe(BASELINE_FILE);
  });

  it("has no duplicate numbers from 0111 on", () => {
    expect(duplicatePrefixes(listMigrationFiles(DB_DIR))).toEqual([]);
    expect(duplicatePrefixes(["0111_a.sql", "111_b.sql"])).toEqual([111]);
  });

  it("only migration files live in db/ next to the snapshot, seed and docs", () => {
    const stray = readdirSync(DB_DIR).filter(
      (f) => !/^\d+_.*\.sql$/.test(f) && !["schema.snapshot.json", "baseline-seed.sql"].includes(f),
    );
    expect(stray).toEqual([]);
  });
});

describe("migration plan", () => {
  const files = [BASELINE_FILE, "00_compat.sql", `${BASELINE_COVERS}_last.sql`, "0111_next.sql"];

  it("runs the baseline on an empty database and only records what it covers", () => {
    expect(planMigrations(files, new Set())).toEqual([
      { file: BASELINE_FILE, action: "run" },
      { file: "00_compat.sql", action: "record" },
      { file: `${BASELINE_COVERS}_last.sql`, action: "record" },
      { file: "0111_next.sql", action: "run" },
    ]);
  });

  it("never runs the baseline on an existing database", () => {
    expect(planMigrations(files, new Set(["00_compat.sql", `${BASELINE_COVERS}_last.sql`]))).toEqual([
      { file: BASELINE_FILE, action: "record" },
      { file: "0111_next.sql", action: "run" },
    ]);
  });

  it("reports checksum drift of applied files without touching them", () => {
    const current = new Map([
      ["a.sql", "1"],
      ["b.sql", "2"],
    ]);
    expect(
      checksumDrift(
        [
          { filename: "a.sql", checksum: "1" },
          { filename: "b.sql", checksum: "x" },
        ],
        current,
      ),
    ).toEqual(["b.sql"]);
  });
});

describe("splitSql", () => {
  it("keeps $tag$ bodies, strings and comments intact", () => {
    const sql = `create function f() returns int language plpgsql as $function$ begin perform 1; return 1; end $function$;
-- a comment; with a semicolon
insert into t values ('a;b');
do $$ begin perform 2; end $$;`;
    expect(splitSql(sql)).toEqual([
      "create function f() returns int language plpgsql as $function$ begin perform 1; return 1; end $function$",
      "insert into t values ('a;b')",
      "do $$ begin perform 2; end $$",
    ]);
  });
});
