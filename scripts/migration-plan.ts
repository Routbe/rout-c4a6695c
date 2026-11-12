/**
 * Shared migration plan for both runners (scripts/migrate.ts, scripts/migrate-gateway.ts)
 * and the CI tests. One rule set: which files count, in which order, how they
 * are checksummed and how a file is split into statements for the gateway.
 *
 * Order is numeric on the prefix (`9_` < `10_` < `100_` < `0111_`), then by
 * name, so 100+ never runs before 10..99 on an empty database.
 */
import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";

export const MIGRATION_FILE_RE = /^(\d+)_[^/]*\.sql$/;

/** Squashed baseline: applied only on an empty database, see planMigrations. */
export const BASELINE_FILE = "0000_baseline.sql";
/** Highest migration number the baseline already contains. */
export const BASELINE_COVERS = 110;

/** First number from which prefixes must be unique (older files are immutable). */
export const UNIQUE_PREFIX_FROM = 111;

export function migrationNumber(file: string): number {
  const m = MIGRATION_FILE_RE.exec(file);
  if (!m) throw new Error(`Not a migration file: ${file}`);
  return Number.parseInt(m[1]!, 10);
}

export function compareMigrationFiles(a: string, b: string): number {
  const d = migrationNumber(a) - migrationNumber(b);
  if (d !== 0) return d;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function orderMigrationFiles(names: readonly string[]): string[] {
  return names.filter((f) => MIGRATION_FILE_RE.test(f)).sort(compareMigrationFiles);
}

export function listMigrationFiles(dir: string): string[] {
  return orderMigrationFiles(readdirSync(dir));
}

export type MigrationStep = { file: string; action: "run" | "record" };

/**
 * What to do with each file. On an empty database (nothing applied) the
 * baseline runs and the files it covers are only recorded; on an existing
 * database the baseline is only recorded and pending files run as usual.
 */
export function planMigrations(files: readonly string[], applied: ReadonlySet<string>): MigrationStep[] {
  const ordered = orderMigrationFiles(files);
  const hasBaseline = ordered.includes(BASELINE_FILE);
  const steps: MigrationStep[] = [];
  if (hasBaseline && applied.size === 0) {
    steps.push({ file: BASELINE_FILE, action: "run" });
    for (const file of ordered) {
      if (file === BASELINE_FILE) continue;
      steps.push({ file, action: migrationNumber(file) <= BASELINE_COVERS ? "record" : "run" });
    }
    return steps;
  }
  for (const file of ordered) {
    if (applied.has(file)) continue;
    steps.push({ file, action: file === BASELINE_FILE ? "record" : "run" });
  }
  return steps;
}

export function checksumOf(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

/** Files numbered >= UNIQUE_PREFIX_FROM that share a number with another file. */
export function duplicatePrefixes(files: readonly string[]): number[] {
  const seen = new Map<number, number>();
  for (const f of files) {
    const n = migrationNumber(f);
    if (n >= UNIQUE_PREFIX_FROM) seen.set(n, (seen.get(n) ?? 0) + 1);
  }
  return [...seen].filter(([, c]) => c > 1).map(([n]) => n);
}

export type AppliedMigration = { filename: string; checksum: string };

/** Applied files whose content changed afterwards. Reported, never repaired. */
export function checksumDrift(
  applied: readonly AppliedMigration[],
  current: ReadonlyMap<string, string>,
): string[] {
  return applied
    .filter((row) => current.has(row.filename) && current.get(row.filename) !== row.checksum)
    .map((row) => row.filename);
}

/** Split on top-level semicolons, respecting $tag$-quoted bodies, strings and -- comments. */
export function splitSql(src: string): string[] {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  let dollarTag: string | null = null;
  let str = false;
  while (i < src.length) {
    const c = src[i]!;
    if (!dollarTag && !str && src.startsWith("--", i)) {
      const e = src.indexOf("\n", i);
      i = e < 0 ? src.length : e;
      continue;
    }
    if (!str && c === "$") {
      const m = /^\$[A-Za-z_]*\$/.exec(src.slice(i));
      if (m) {
        if (dollarTag === null) dollarTag = m[0];
        else if (dollarTag === m[0]) dollarTag = null;
        cur += m[0];
        i += m[0].length;
        continue;
      }
    }
    if (!dollarTag && c === "'") str = !str;
    if (!dollarTag && !str && c === ";") {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
