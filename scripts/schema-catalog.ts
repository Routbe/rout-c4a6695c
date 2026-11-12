/**
 * Reads the database structure from the Postgres catalog and renders it.
 * One reader for three uses:
 *   - db/schema.snapshot.json  (drift detection: live vs. repo, CI replay vs. repo)
 *   - db/0000_baseline.sql     (squashed baseline for empty databases)
 *   - src/lib/db-types.gen.ts  (row types without an ORM)
 *
 * The reader only takes an `exec` function, so it works over the Neon gateway,
 * a direct connection and the in-process PGlite used by the tests.
 */

export type Exec = (query: string) => Promise<Record<string, unknown>[]>;

export const SNAPSHOT_SCHEMAS = ["public", "neon_auth", "auth", "storage"] as const;
/** Roles whose grants are part of the schema (platform roles are managed by Neon). */
export const SNAPSHOT_ROLES = ["rout_app"] as const;

export type Column = {
  name: string;
  type: string;
  notNull: boolean;
  default: string | null;
  identity: "a" | "d" | null;
  generated: string | null;
};
export type Constraint = { name: string; kind: "p" | "u" | "c" | "f" | "x"; def: string };
export type Policy = {
  name: string;
  permissive: boolean;
  roles: string[];
  cmd: string;
  using: string | null;
  check: string | null;
};
export type Table = {
  schema: string;
  name: string;
  columns: Column[];
  constraints: Constraint[];
  indexes: string[];
  triggers: string[];
  rls: boolean;
  forceRls: boolean;
  policies: Policy[];
  grants: Record<string, string[]>;
};
export type Sequence = {
  schema: string;
  name: string;
  type: string;
  start: string;
  increment: string;
  min: string;
  max: string;
  cycle: boolean;
  ownedBy: string | null;
  grants: Record<string, string[]>;
};
export type View = { schema: string; name: string; def: string; grants: Record<string, string[]> };
export type Fn = { schema: string; name: string; args: string; def: string };
export type Enum = { schema: string; name: string; labels: string[] };

export type Catalog = {
  version: 1;
  schemas: string[];
  extensions: string[];
  enums: Enum[];
  sequences: Sequence[];
  tables: Table[];
  views: View[];
  functions: Fn[];
  schemaGrants: Record<string, string[]>;
};

const list = (xs: readonly string[]) => xs.map((x) => `'${x}'`).join(", ");
const S = list(SNAPSHOT_SCHEMAS);
const R = list(SNAPSHOT_ROLES);

const bool = (v: unknown) => v === true || v === "t" || v === "true";
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const arr = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") {
    const inner = v.replace(/^\{|\}$/g, "");
    return inner ? inner.split(",").map((s) => s.replace(/^"|"$/g, "")) : [];
  }
  return [];
};
const byName = <T extends { schema: string; name: string }>(a: T, b: T) =>
  `${a.schema}.${a.name}` < `${b.schema}.${b.name}` ? -1 : `${a.schema}.${a.name}` > `${b.schema}.${b.name}` ? 1 : 0;
const key = (schema: unknown, name: unknown) => `${String(schema)}.${String(name)}`;

function grantMap(rows: Record<string, unknown>[], k: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const r of rows) {
    if (key(r["schema"], r["name"]) !== k) continue;
    const role = String(r["grantee"]);
    (out[role] ??= []).push(String(r["privilege"]));
  }
  for (const role of Object.keys(out)) out[role] = [...new Set(out[role])].sort();
  return out;
}

/** Normalizes catalog text that differs only cosmetically between Postgres versions. */
export function normalizeDef(def: string): string {
  return def.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim();
}

export async function readCatalog(exec: Exec): Promise<Catalog> {
  const [schemas, extensions, enums, sequences, tables, columns, constraints, indexes, triggers, policies, views, functions, relGrants, schemaGrants] =
    await Promise.all([
      exec(`select nspname from pg_namespace where nspname in (${S}) order by 1`),
      exec(`select extname from pg_extension where extname <> 'plpgsql' order by 1`),
      exec(`select n.nspname as schema, t.typname as name,
                   array_agg(e.enumlabel::text order by e.enumsortorder) as labels
              from pg_type t join pg_namespace n on n.oid = t.typnamespace
              join pg_enum e on e.enumtypid = t.oid
             where n.nspname in (${S}) group by 1, 2 order by 1, 2`),
      exec(`select s.schemaname as schema, s.sequencename as name, s.data_type::text as type,
                   s.start_value::text as start, s.increment_by::text as increment,
                   s.min_value::text as min, s.max_value::text as max, s.cycle,
                   (select tn.nspname || '.' || tc.relname || '.' || a.attname
                      from pg_depend d join pg_class tc on tc.oid = d.refobjid
                      join pg_namespace tn on tn.oid = tc.relnamespace
                      join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
                     where d.objid = c.oid and d.classid = 'pg_class'::regclass and d.deptype = 'a' limit 1) as owned_by
              from pg_sequences s
              join pg_namespace n on n.nspname = s.schemaname
              join pg_class c on c.relname = s.sequencename and c.relnamespace = n.oid
             where s.schemaname in (${S})
               and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'i')
             order by 1, 2`),
      exec(`select n.nspname as schema, c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as force_rls
              from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where c.relkind in ('r', 'p') and n.nspname in (${S})
               and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
             order by 1, 2`),
      exec(`select n.nspname as schema, c.relname as name, a.attname as col, a.attnum as pos,
                   format_type(a.atttypid, a.atttypmod) as type, a.attnotnull as not_null,
                   case when a.attgenerated = '' then pg_get_expr(ad.adbin, ad.adrelid) end as default_expr,
                   nullif(a.attidentity, '') as identity,
                   case when a.attgenerated <> '' then pg_get_expr(ad.adbin, ad.adrelid) end as generated
              from pg_attribute a
              join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
              left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
             where c.relkind in ('r', 'p') and n.nspname in (${S}) and a.attnum > 0 and not a.attisdropped
             order by 1, 2, a.attnum`),
      exec(`select n.nspname as schema, c.relname as name, con.conname as con, con.contype as kind,
                   pg_get_constraintdef(con.oid) as def
              from pg_constraint con join pg_class c on c.oid = con.conrelid
              join pg_namespace n on n.oid = c.relnamespace
             where n.nspname in (${S}) and con.contype in ('p', 'u', 'c', 'f', 'x')
             order by 1, 2, 3`),
      exec(`select n.nspname as schema, c.relname as name, pg_get_indexdef(i.indexrelid) as def
              from pg_index i join pg_class c on c.oid = i.indrelid
              join pg_namespace n on n.oid = c.relnamespace
             where n.nspname in (${S}) and c.relkind in ('r', 'p')
               and not exists (select 1 from pg_constraint con where con.conindid = i.indexrelid and con.conrelid = i.indrelid)
             order by 1, 2, 3`),
      exec(`select n.nspname as schema, c.relname as name, pg_get_triggerdef(t.oid) as def
              from pg_trigger t join pg_class c on c.oid = t.tgrelid
              join pg_namespace n on n.oid = c.relnamespace
             where not t.tgisinternal and n.nspname in (${S})
             order by 1, 2, 3`),
      exec(`select schemaname as schema, tablename as name, policyname as policy, permissive = 'PERMISSIVE' as permissive,
                   roles::text[] as roles, cmd, qual, with_check
              from pg_policies where schemaname in (${S}) order by 1, 2, 3`),
      exec(`select n.nspname as schema, c.relname as name, pg_get_viewdef(c.oid, true) as def
              from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where c.relkind = 'v' and n.nspname in (${S})
               and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
             order by c.oid`),
      exec(`select n.nspname as schema, p.proname as name, pg_get_function_identity_arguments(p.oid) as args,
                   pg_get_functiondef(p.oid) as def
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname in (${S}) and p.prokind in ('f', 'p')
               and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
             order by 1, 2, 3`),
      exec(`select n.nspname as schema, c.relname as name, r.rolname as grantee, x.privilege_type as privilege
              from pg_class c join pg_namespace n on n.oid = c.relnamespace,
                   lateral aclexplode(c.relacl) x
              join pg_roles r on r.oid = x.grantee
             where n.nspname in (${S}) and c.relkind in ('r', 'p', 'v', 'S') and r.rolname in (${R})`),
      exec(`select n.nspname as schema, r.rolname as grantee, x.privilege_type as privilege
              from pg_namespace n, lateral aclexplode(n.nspacl) x
              join pg_roles r on r.oid = x.grantee
             where n.nspname in (${S}) and r.rolname in (${R})`),
    ]);

  // The migration ledger belongs to the runners, not to the schema.
  const tableList: Table[] = tables.filter((t) => key(t["schema"], t["name"]) !== "public.schema_migrations").map((t) => {
    const k = key(t["schema"], t["name"]);
    return {
      schema: String(t["schema"]),
      name: String(t["name"]),
      columns: columns
        .filter((c) => key(c["schema"], c["name"]) === k)
        .sort((a, b) => Number(a["pos"]) - Number(b["pos"]))
        .map((c) => ({
          name: String(c["col"]),
          type: String(c["type"]),
          notNull: bool(c["not_null"]),
          default: str(c["default_expr"]),
          identity: (str(c["identity"]) as Column["identity"]) ?? null,
          generated: str(c["generated"]),
        })),
      constraints: constraints
        .filter((c) => key(c["schema"], c["name"]) === k)
        .map((c) => ({ name: String(c["con"]), kind: String(c["kind"]) as Constraint["kind"], def: normalizeDef(String(c["def"])) }))
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
      indexes: indexes.filter((i) => key(i["schema"], i["name"]) === k).map((i) => normalizeDef(String(i["def"]))).sort(),
      triggers: triggers.filter((i) => key(i["schema"], i["name"]) === k).map((i) => normalizeDef(String(i["def"]))).sort(),
      rls: bool(t["rls"]),
      forceRls: bool(t["force_rls"]),
      policies: policies
        .filter((p) => key(p["schema"], p["name"]) === k)
        .map((p) => ({
          name: String(p["policy"]),
          permissive: bool(p["permissive"]),
          roles: arr(p["roles"]).sort(),
          cmd: String(p["cmd"]),
          using: str(p["qual"]),
          check: str(p["with_check"]),
        }))
        .sort((a, b) => (a.name < b.name ? -1 : 1)),
      grants: grantMap(relGrants, k),
    };
  });

  const schemaGrantMap: Record<string, string[]> = {};
  for (const r of schemaGrants) {
    const role = `${String(r["schema"])}:${String(r["grantee"])}`;
    (schemaGrantMap[role] ??= []).push(String(r["privilege"]));
  }
  for (const k of Object.keys(schemaGrantMap)) schemaGrantMap[k] = [...new Set(schemaGrantMap[k])].sort();

  return {
    version: 1,
    schemas: schemas.map((r) => String(r["nspname"])),
    extensions: extensions.map((r) => String(r["extname"])),
    enums: enums.map((e) => ({ schema: String(e["schema"]), name: String(e["name"]), labels: arr(e["labels"]) })),
    sequences: sequences
      .map((s) => ({
        schema: String(s["schema"]),
        name: String(s["name"]),
        type: String(s["type"]),
        start: String(s["start"]),
        increment: String(s["increment"]),
        min: String(s["min"]),
        max: String(s["max"]),
        cycle: bool(s["cycle"]),
        ownedBy: str(s["owned_by"]),
        grants: grantMap(relGrants, key(s["schema"], s["name"])),
      }))
      .sort(byName),
    tables: tableList.sort(byName),
    // Views keep creation order (oid) so dependent views follow their base views.
    views: views.map((v) => ({
      schema: String(v["schema"]),
      name: String(v["name"]),
      def: normalizeDef(String(v["def"])),
      grants: grantMap(relGrants, key(v["schema"], v["name"])),
    })),
    functions: functions
      .map((f) => ({ schema: String(f["schema"]), name: String(f["name"]), args: String(f["args"]), def: normalizeDef(String(f["def"])) }))
      .sort((a, b) => byName(a, b) || (a.args < b.args ? -1 : a.args > b.args ? 1 : 0)),
    schemaGrants: schemaGrantMap,
  };
}

/** Stable JSON so the snapshot diffs line by line. */
export function catalogJson(catalog: Catalog): string {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}

/**
 * Comparable form of a CHECK definition. Postgres versions deparse the same
 * AND chain with different grouping (`((a AND b) AND c)` vs `(a AND b AND c)`),
 * so grouping parentheses are ignored when comparing check constraints.
 */
export function canonicalCheck(def: string): string {
  return def.replace(/[()]/g, "").replace(/\s+/g, " ").trim();
}

function comparable(c: Constraint): Constraint {
  return c.kind === "c" ? { ...c, def: canonicalCheck(c.def) } : c;
}

/** Human-readable differences between two catalogs (empty = identical). */
export function diffCatalogs(expected: Catalog, actual: Catalog): string[] {
  const out: string[] = [];
  const index = <T>(xs: T[], k: (x: T) => string) => new Map(xs.map((x) => [k(x), x]));
  const cmp = <T>(label: string, a: T[], b: T[], k: (x: T) => string) => {
    const A = index(a, k);
    const B = index(b, k);
    for (const [name, x] of A) {
      const y = B.get(name);
      if (!y) out.push(`- ${label} ${name} (missing)`);
      else if (JSON.stringify(x) !== JSON.stringify(y)) out.push(`~ ${label} ${name} differs`);
    }
    for (const name of B.keys()) if (!A.has(name)) out.push(`+ ${label} ${name} (unexpected)`);
  };
  cmp("schema", expected.schemas, actual.schemas, (x) => x);
  cmp("extension", expected.extensions, actual.extensions, (x) => x);
  cmp("enum", expected.enums, actual.enums, (x) => `${x.schema}.${x.name}`);
  cmp("sequence", expected.sequences, actual.sequences, (x) => `${x.schema}.${x.name}`);
  cmp("view", expected.views, actual.views, (x) => `${x.schema}.${x.name}`);
  cmp("function", expected.functions, actual.functions, (x) => `${x.schema}.${x.name}(${x.args})`);
  const A = index(expected.tables, (t) => `${t.schema}.${t.name}`);
  const B = index(actual.tables, (t) => `${t.schema}.${t.name}`);
  for (const [name, t] of A) {
    const u = B.get(name);
    if (!u) {
      out.push(`- table ${name} (missing)`);
      continue;
    }
    cmp(`column ${name}`, t.columns, u.columns, (c) => c.name);
    cmp(`constraint ${name}`, t.constraints.map(comparable), u.constraints.map(comparable), (c) => c.name);
    cmp(`index ${name}`, t.indexes, u.indexes, (x) => x);
    cmp(`trigger ${name}`, t.triggers, u.triggers, (x) => x);
    cmp(`policy ${name}`, t.policies, u.policies, (p) => p.name);
    if (t.rls !== u.rls || t.forceRls !== u.forceRls) out.push(`~ rls ${name} differs`);
    if (JSON.stringify(t.grants) !== JSON.stringify(u.grants)) out.push(`~ grants ${name} differ`);
  }
  for (const name of B.keys()) if (!A.has(name)) out.push(`+ table ${name} (unexpected)`);
  if (JSON.stringify(expected.schemaGrants) !== JSON.stringify(actual.schemaGrants)) out.push("~ schema grants differ");
  return out;
}

/* ------------------------------------------------------------- baseline */

const qi = (ident: string) => (/^[a-z_][a-z0-9_]*$/.test(ident) ? ident : `"${ident.replace(/"/g, '""')}"`);
const qn = (schema: string, name: string) => `${qi(schema)}.${qi(name)}`;
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

function grantSql(target: string, grants: Record<string, string[]>, kind = "table"): string[] {
  return Object.entries(grants).map(([role, privs]) => `grant ${privs.join(", ").toLowerCase()} on ${kind === "sequence" ? "sequence " : ""}${target} to ${qi(role)};`);
}

function policySql(t: Table, p: Policy): string {
  const parts = [`create policy ${qi(p.name)} on ${qn(t.schema, t.name)}`, `as ${p.permissive ? "permissive" : "restrictive"}`, `for ${p.cmd.toLowerCase()}`];
  parts.push(`to ${p.roles.map((r) => (r === "public" ? "public" : qi(r))).join(", ")}`);
  if (p.using) parts.push(`using (${p.using})`);
  if (p.check) parts.push(`with check (${p.check})`);
  return `${parts.join(" ")};`;
}

/**
 * Renders a squashed baseline: everything the migrations up to `covers`
 * produced, in an order that applies on an empty database.
 */
export function renderBaseline(catalog: Catalog, opts: { covers: number; seedSql: string; generatedAt: string }): string {
  const L: string[] = [];
  L.push(`-- 0000 — Squashed baseline (generated by scripts/schema-snapshot.ts --baseline on ${opts.generatedAt}).`);
  L.push(`-- Covers every migration numbered <= ${opts.covers}. The runners apply this file only on an`);
  L.push("-- empty database (no rows in public.schema_migrations) and then record the covered files as");
  L.push("-- applied; on an existing database it is recorded as applied without running. Immutable.");
  L.push("");
  L.push("set check_function_bodies = off;");
  L.push("");
  for (const e of catalog.extensions) L.push(`create extension if not exists ${qi(e)};`);
  for (const s of catalog.schemas) if (s !== "public") L.push(`create schema if not exists ${qi(s)};`);
  for (const role of SNAPSHOT_ROLES) {
    L.push(`do $$ begin if not exists (select 1 from pg_roles where rolname = ${lit(role)}) then create role ${qi(role)} nologin; end if; end $$;`);
  }
  L.push("");
  for (const e of catalog.enums) L.push(`create type ${qn(e.schema, e.name)} as enum (${e.labels.map(lit).join(", ")});`);
  for (const s of catalog.sequences) {
    L.push(
      `create sequence ${qn(s.schema, s.name)} as ${s.type} increment by ${s.increment} minvalue ${s.min} maxvalue ${s.max} start with ${s.start}${s.cycle ? " cycle" : ""};`,
    );
  }
  L.push("");
  for (const t of catalog.tables) {
    const cols = t.columns.map((c) => {
      let def = `  ${qi(c.name)} ${c.type}`;
      if (c.identity) def += ` generated ${c.identity === "a" ? "always" : "by default"} as identity`;
      if (c.generated) def += ` generated always as (${c.generated}) stored`;
      if (c.notNull) def += " not null";
      return def;
    });
    L.push(`create table ${qn(t.schema, t.name)} (\n${cols.join(",\n")}\n);`);
  }
  L.push("");
  for (const f of catalog.functions) L.push(`${f.def};`, "");
  for (const v of catalog.views) L.push(`create view ${qn(v.schema, v.name)} as\n${v.def.replace(/;$/, "")};`, "");
  for (const t of catalog.tables) {
    for (const c of t.columns) {
      if (c.default !== null) L.push(`alter table ${qn(t.schema, t.name)} alter column ${qi(c.name)} set default ${c.default};`);
    }
  }
  for (const s of catalog.sequences) {
    if (s.ownedBy) {
      const [schema, table, col] = s.ownedBy.split(".") as [string, string, string];
      L.push(`alter sequence ${qn(s.schema, s.name)} owned by ${qn(schema, table)}.${qi(col)};`);
    }
  }
  L.push("");
  const order: Constraint["kind"][] = ["p", "u", "x", "c", "f"];
  for (const kind of order) {
    for (const t of catalog.tables) {
      for (const c of t.constraints.filter((x) => x.kind === kind)) {
        L.push(`alter table ${qn(t.schema, t.name)} add constraint ${qi(c.name)} ${c.def};`);
      }
    }
  }
  L.push("");
  for (const t of catalog.tables) for (const i of t.indexes) L.push(`${i};`);
  L.push("");
  for (const t of catalog.tables) for (const tr of t.triggers) L.push(`${tr};`);
  L.push("");
  for (const t of catalog.tables) {
    if (t.rls) L.push(`alter table ${qn(t.schema, t.name)} enable row level security;`);
    if (t.forceRls) L.push(`alter table ${qn(t.schema, t.name)} force row level security;`);
    for (const p of t.policies) L.push(policySql(t, p));
  }
  L.push("");
  for (const [k, privs] of Object.entries(catalog.schemaGrants)) {
    const [schema, role] = k.split(":") as [string, string];
    L.push(`grant ${privs.join(", ").toLowerCase()} on schema ${qi(schema)} to ${qi(role)};`);
  }
  for (const t of catalog.tables) L.push(...grantSql(qn(t.schema, t.name), t.grants));
  for (const v of catalog.views) L.push(...grantSql(qn(v.schema, v.name), v.grants));
  for (const s of catalog.sequences) L.push(...grantSql(qn(s.schema, s.name), s.grants, "sequence"));
  L.push("", "reset check_function_bodies;", "", "-- Reference data seeded by the covered migrations.", opts.seedSql.trim(), "");
  return L.join("\n");
}

/* ---------------------------------------------------------------- types */

const pascal = (s: string) =>
  s
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join("");

/** TypeScript type for a Postgres column type (as returned by format_type). */
export function tsTypeFor(pgType: string, enums: ReadonlyMap<string, string>): string {
  const isArray = pgType.endsWith("[]");
  const base = pgType.replace(/\[\]$/, "").replace(/\(.*\)$/, "").trim();
  let t: string;
  if (enums.has(base)) t = enums.get(base)!;
  else if (/^(smallint|integer|real|double precision)$/.test(base)) t = "number";
  else if (/^(bigint|numeric)$/.test(base)) t = "string";
  else if (base === "boolean") t = "boolean";
  else if (/^jsonb?$/.test(base)) t = "JsonValue";
  else if (/^(timestamp|date|time)/.test(base)) t = "string | Date";
  else if (base === "bytea") t = "Uint8Array";
  else t = "string";
  return isArray ? `Array<${t}>` : t;
}

export function renderDbTypes(catalog: Catalog): string {
  const enums = new Map<string, string>();
  const L: string[] = [
    "// Generated by scripts/schema-snapshot.ts from db/schema.snapshot.json. Do not edit.",
    "/* eslint-disable */",
    "",
    "export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };",
    "",
  ];
  for (const e of catalog.enums) {
    const name = `${pascal(e.schema)}${pascal(e.name)}`;
    L.push(`export type ${name} = ${e.labels.map((l) => JSON.stringify(l)).join(" | ")};`);
    enums.set(e.schema === "public" ? e.name : `${e.schema}.${e.name}`, name);
    enums.set(`${e.schema}.${e.name}`, name);
  }
  L.push("");
  const entries: string[] = [];
  for (const t of catalog.tables) {
    const name = `${pascal(t.schema)}${pascal(t.name)}Row`;
    L.push(`export interface ${name} {`);
    for (const c of t.columns) {
      const ts = tsTypeFor(c.type, enums);
      L.push(`  ${JSON.stringify(c.name)}: ${ts}${c.notNull ? "" : " | null"};`);
    }
    L.push("}", "");
    entries.push(`  ${JSON.stringify(`${t.schema}.${t.name}`)}: ${name};`);
  }
  L.push("export interface DbTables {", ...entries, "}", "");
  L.push("export type DbTableName = keyof DbTables;");
  L.push("export type DbRow<T extends DbTableName> = DbTables[T];");
  L.push("");
  return L.join("\n");
}
