/**
 * Emergency session wipe after a credential leak. Signs every user out and
 * invalidates pending login codes. Uses the OWNER connection (MIGRATION_URL).
 *
 *   bun scripts/revoke-all-sessions.ts            dry run (counts only)
 *   bun scripts/revoke-all-sessions.ts --confirm  delete
 *
 * Tables that do not exist are skipped.
 */
import { Pool } from "@neondatabase/serverless";

const url = process.env["MIGRATION_URL"];
if (!url) {
  console.error("MIGRATION_URL ontbreekt.");
  process.exit(1);
}
const confirm = process.argv.includes("--confirm");

const TABLES = [
  "neon_auth.session",
  "public.user_sessions",
  "public.auth_tokens",
  "public.oauth_auth_codes",
  "public.oauth_step_up_codes",
  "public.admin_bootstrap_tokens",
];

const pool = new Pool({ connectionString: url });
try {
  for (const t of TABLES) {
    const exists = await pool.query("select to_regclass($1) as r", [t]);
    if (!exists.rows[0]?.r) {
      console.log(`${t}: bestaat niet, overgeslagen`);
      continue;
    }
    if (confirm) {
      const res = await pool.query(`delete from ${t}`);
      console.log(`${t}: ${res.rowCount ?? 0} rijen verwijderd`);
    } else {
      const res = await pool.query(`select count(*)::int as n from ${t}`);
      console.log(`${t}: ${res.rows[0]?.n ?? 0} rijen (dry run)`);
    }
  }
  if (!confirm) console.log("Niets verwijderd. Herhaal met --confirm.");
} finally {
  await pool.end();
}
