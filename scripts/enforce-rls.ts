/**
 * Read-only deployment preflight. Role changes require a separately reviewed migration.
 * The transition is safe only after:
 *   1. the deployed app propagates rout.user_id (src/lib/neon.ts withDbContext),
 *   2. db/0126 is applied,
 *   3. server-only paths (sign-in lookups, cron, public pages) run as a role
 *      that may bypass RLS, otherwise they return no rows.
 * Usage: bun scripts/enforce-rls.ts
 */
import { runQuery } from "../src/lib/neon";
import { enforcementBlockers } from "./rls-enforcement-preflight";
const result = await runQuery(`select current_user as connection_role, r.rolbypassrls as bypass, r.rolsuper as superuser,
  exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relowner=r.oid) as owns_tables,
  array(select c.relname::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity) as unprotected
  from pg_roles r where r.rolname=current_user`);
const role = result.rows[0];
if (!role) throw new Error("Runtime role unavailable");
const blockers = enforcementBlockers({ connectionRole: String(role["connection_role"]), targetRole: "rout_app", bypass: Boolean(role["bypass"]), superuser: Boolean(role["superuser"]), ownsTables: Boolean(role["owns_tables"]) }, role["unprotected"] as string[], false);
console.log(JSON.stringify({ connectionRole: role["connection_role"], bypass: role["bypass"], blockers, roleChanged: false }, null, 2));
process.exitCode = blockers.length || role["bypass"] ? 1 : 0;
