/**
 * Applies pending db/NN_*.sql files through the Lovable Neon connector gateway
 * (LOVABLE_API_KEY + NEON_API_KEY), tracked in public.schema_migrations.
 * Each file is sent as one batch statement => one transaction.
 *
 *   bun scripts/migrate-gateway.ts            apply pending
 *   bun scripts/migrate-gateway.ts --dry-run  list pending
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checksumDrift, checksumOf, listMigrationFiles, planMigrations, splitSql } from "./migration-plan";

const URL_ = "https://connector-gateway.lovable.dev/neon/sql";
async function q(body: unknown): Promise<any> {
  const res = await fetch(URL_, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`,
      "X-Connection-Api-Key": process.env["NEON_API_KEY"] ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

const dryRun = process.argv.includes("--dry-run");
// --only=a.sql,b.sql applies just those files (e.g. to hold back a migration waiting on a deploy).
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",").filter(Boolean);
const dir = join(import.meta.dir, "..", "db");
const files = listMigrationFiles(dir);
await q({
  query: "create table if not exists public.schema_migrations (filename text primary key, checksum text not null, applied_at timestamptz not null default now())",
  params: [],
});
const applied = (await q({ query: "select filename, checksum from public.schema_migrations", params: [] })).rows as {
  filename: string;
  checksum: string;
}[];
const done = new Set(applied.map((r) => r.filename));
const current = new Map(files.map((f) => [f, checksumOf(readFileSync(join(dir, f), "utf8"))]));
for (const file of checksumDrift(applied, current)) console.warn(`! ${file} is gewijzigd na toepassen (niet opnieuw gedraaid).`);

const record = (file: string) => ({
  query: "insert into public.schema_migrations (filename, checksum) values ($1, $2)",
  params: [file, current.get(file)!],
});
for (const step of planMigrations(files, done)) {
  const { file } = step;
  if (only && !only.includes(file)) continue;
  if (dryRun) {
    console.log(`… ${step.action === "run" ? "pending" : "record "} ${file}`);
    continue;
  }
  try {
    if (step.action === "record") {
      await q({ queries: [record(file)] });
      console.log(`= ${file} (recorded, covered by baseline)`);
      continue;
    }
    const body = readFileSync(join(dir, file), "utf8");
    await q({ queries: [...splitSql(body).map((query) => ({ query, params: [] })), record(file)] });
    console.log(`✓ ${file}`);
  } catch (e) {
    console.error(`✗ ${file}: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
    break;
  }
}
