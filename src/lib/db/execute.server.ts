/**
 * Compiles a {@link QueryDescriptor} to SQL and runs it on Neon.
 *
 * Server-only. Identifiers are validated against a strict pattern and every
 * value travels as a bind parameter, so a descriptor coming from the browser
 * can never inject SQL.
 */
import { sql } from "@/lib/neon";
import type { QueryDescriptor, QueryFilter, QueryResult, RpcDescriptor } from "./types";

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function ident(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Invalid identifier: ${name}`);
  return `"${name}"`;
}

class Params {
  readonly values: unknown[] = [];
  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

type ParsedSelect = { columns: string[]; embeds: { table: string; columns: string[] }[] };

/** Splits `id, name, badges(slug)` into plain columns and embedded relations. */
export function parseSelect(select: string): ParsedSelect {
  const columns: string[] = [];
  const embeds: ParsedSelect["embeds"] = [];
  let depth = 0;
  let current = "";
  const flush = () => {
    const part = current.trim();
    current = "";
    if (!part) return;
    const embed = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*)\)$/s.exec(part);
    if (embed) {
      embeds.push({
        table: embed[1]!,
        columns: embed[2]!
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
      });
    } else {
      columns.push(part);
    }
  };
  for (const char of select) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      flush();
      continue;
    }
    current += char;
  }
  flush();
  return { columns, embeds };
}

let fkCache: Map<string, { column: string; target: string; targetColumn: string }[]> | null = null;

async function foreignKeys(table: string) {
  if (!fkCache) {
    const rows = (await sql.query(
      `select src.relname as src_table, att.attname as src_column,
              tgt.relname as tgt_table, tatt.attname as tgt_column
         from pg_constraint c
         join pg_class src on src.oid = c.conrelid
         join pg_class tgt on tgt.oid = c.confrelid
         join unnest(c.conkey) with ordinality as k(attnum, ord) on true
         join unnest(c.confkey) with ordinality as fk(attnum, ord) on fk.ord = k.ord
         join pg_attribute att on att.attrelid = c.conrelid and att.attnum = k.attnum
         join pg_attribute tatt on tatt.attrelid = c.confrelid and tatt.attnum = fk.attnum
        where c.contype = 'f' and c.connamespace = 'public'::regnamespace`,
      [],
    )) as { src_table: string; src_column: string; tgt_table: string; tgt_column: string }[];
    fkCache = new Map();
    for (const row of rows) {
      const list = fkCache.get(row.src_table) ?? [];
      list.push({ column: row.src_column, target: row.tgt_table, targetColumn: row.tgt_column });
      fkCache.set(row.src_table, list);
    }
  }
  return fkCache.get(table) ?? [];
}

async function buildSelectList(table: string, select: string): Promise<string> {
  const parsed = parseSelect(select);
  const pieces: string[] = [];
  if (parsed.columns.length === 0 || parsed.columns.includes("*")) {
    pieces.push(`${ident(table)}.*`);
    for (const column of parsed.columns.filter((c) => c !== "*")) {
      pieces.push(`${ident(table)}.${ident(column)}`);
    }
  } else {
    for (const column of parsed.columns) pieces.push(`${ident(table)}.${ident(column)}`);
  }
  for (const embed of parsed.embeds) {
    const fks = await foreignKeys(table);
    const fk = fks.find((f) => f.target === embed.table);
    if (!fk) throw new Error(`No relation between ${table} and ${embed.table}`);
    const inner =
      embed.columns.length === 0 || embed.columns.includes("*")
        ? `to_jsonb(e)`
        : `jsonb_build_object(${embed.columns
            .map((c) => `'${c.replace(/'/g, "''")}', e.${ident(c)}`)
            .join(", ")})`;
    pieces.push(
      `(select ${inner} from ${ident(embed.table)} e where e.${ident(fk.targetColumn)} = ${ident(
        table,
      )}.${ident(fk.column)}) as ${ident(embed.table)}`,
    );
  }
  return pieces.join(", ");
}

function renderFilter(filter: QueryFilter, params: Params, table: string): string {
  const col = filter.column ? `${ident(table)}.${ident(filter.column)}` : "";
  switch (filter.op) {
    case "eq":
      return `${col} = ${params.add(filter.value)}`;
    case "neq":
      return `${col} <> ${params.add(filter.value)}`;
    case "gt":
      return `${col} > ${params.add(filter.value)}`;
    case "gte":
      return `${col} >= ${params.add(filter.value)}`;
    case "lt":
      return `${col} < ${params.add(filter.value)}`;
    case "lte":
      return `${col} <= ${params.add(filter.value)}`;
    case "like":
      return `${col} like ${params.add(filter.value)}`;
    case "ilike":
      return `${col} ilike ${params.add(filter.value)}`;
    case "is":
      if (filter.value === null) return `${col} is null`;
      return `${col} is ${filter.value === true ? "true" : filter.value === false ? "false" : "null"}`;
    case "in": {
      const list = Array.isArray(filter.value) ? filter.value : [];
      if (list.length === 0) return "false";
      return `${col} = any(${params.add(list)})`;
    }
    case "contains":
      return `${col} @> ${params.add(JSON.stringify(filter.value))}::jsonb`;
    case "not": {
      const inner = renderFilter(
        {
          op: (filter.negatedOp ?? "eq") as QueryFilter["op"],
          column: filter.column,
          value: filter.value,
        },
        params,
        table,
      );
      return `not (${inner})`;
    }
    case "or": {
      const parts = String(filter.value)
        .split(",")
        .map((clause) => {
          const [column, op, ...rest] = clause.split(".");
          const value = rest.join(".");
          return renderFilter(
            {
              op: (op ?? "eq") as QueryFilter["op"],
              column: column ?? "",
              value: value === "null" ? null : value,
            },
            params,
            table,
          );
        });
      return `(${parts.join(" or ")})`;
    }
    default:
      throw new Error(`Unsupported filter: ${String(filter.op)}`);
  }
}

function whereClause(descriptor: QueryDescriptor, params: Params): string {
  if (descriptor.filters.length === 0) return "";
  return ` where ${descriptor.filters.map((f) => renderFilter(f, params, descriptor.table)).join(" and ")}`;
}

function ok(data: unknown, count: number | null = null): QueryResult {
  return { data, error: null, count, status: 200 };
}

function shapeRows(descriptor: QueryDescriptor, rows: unknown[]): QueryResult {
  if (descriptor.rowMode === "single") {
    if (rows.length !== 1) {
      return {
        data: null,
        error: {
          message: rows.length === 0 ? "No rows found" : "More than one row returned",
          code: "PGRST116",
        },
        count: null,
        status: 406,
      };
    }
    return ok(rows[0]);
  }
  if (descriptor.rowMode === "maybe") return ok(rows[0] ?? null);
  return ok(rows);
}

export async function executeDescriptor(descriptor: QueryDescriptor): Promise<QueryResult> {
  try {
    const params = new Params();
    const table = ident(descriptor.table);

    if (descriptor.action === "select") {
      const where = whereClause(descriptor, params);
      let count: number | null = null;
      if (descriptor.count) {
        const countParams = new Params();
        const countWhere = whereClause(descriptor, countParams);
        const rows = (await sql.query(
          `select count(*)::int as count from ${table}${countWhere}`,
          countParams.values,
        )) as { count: number }[];
        count = rows[0]?.count ?? 0;
      }
      if (descriptor.head) return { data: null, error: null, count, status: 200 };

      const selectList = await buildSelectList(descriptor.table, descriptor.columns || "*");
      let text = `select ${selectList} from ${table}${where}`;
      if (descriptor.order.length) {
        text += ` order by ${descriptor.order
          .map(
            (o) =>
              `${ident(descriptor.table)}.${ident(o.column)} ${o.ascending ? "asc" : "desc"}` +
              (o.nullsFirst === undefined ? "" : o.nullsFirst ? " nulls first" : " nulls last"),
          )
          .join(", ")}`;
      }
      if (descriptor.range) {
        text += ` limit ${params.add(descriptor.range.to - descriptor.range.from + 1)} offset ${params.add(
          descriptor.range.from,
        )}`;
      } else if (descriptor.limit !== undefined) {
        text += ` limit ${params.add(descriptor.limit)}`;
      } else if (descriptor.rowMode) {
        text += " limit 2";
      }
      const rows = (await sql.query(text, params.values)) as unknown[];
      const shaped = shapeRows(descriptor, rows);
      return { ...shaped, count };
    }

    if (descriptor.action === "insert" || descriptor.action === "upsert") {
      const rows = Array.isArray(descriptor.values) ? descriptor.values : [descriptor.values ?? {}];
      if (rows.length === 0) return ok([]);
      const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
      if (columns.length === 0) throw new Error("Insert without columns");
      const tuples = rows.map(
        (row) => `(${columns.map((c) => params.add(normalize(row[c]))).join(", ")})`,
      );
      let text = `insert into ${table} (${columns.map(ident).join(", ")}) values ${tuples.join(", ")}`;
      if (descriptor.action === "upsert") {
        const conflict = (descriptor.onConflict ?? "id")
          .split(",")
          .map((c) => ident(c.trim()))
          .join(", ");
        text += descriptor.ignoreDuplicates
          ? ` on conflict (${conflict}) do nothing`
          : ` on conflict (${conflict}) do update set ${columns
              .map((c) => `${ident(c)} = excluded.${ident(c)}`)
              .join(", ")}`;
      }
      if (descriptor.returning) text += ` returning ${await returningList(descriptor)}`;
      const result = (await sql.query(text, params.values)) as unknown[];
      return descriptor.returning ? shapeRows(descriptor, result) : ok(null);
    }

    if (descriptor.action === "update") {
      const values = (descriptor.values ?? {}) as Record<string, unknown>;
      const assignments = Object.entries(values).map(
        ([column, value]) => `${ident(column)} = ${params.add(normalize(value))}`,
      );
      if (assignments.length === 0) return ok(null);
      let text = `update ${table} set ${assignments.join(", ")}${whereClause(descriptor, params)}`;
      if (descriptor.returning) text += ` returning ${await returningList(descriptor)}`;
      const result = (await sql.query(text, params.values)) as unknown[];
      return descriptor.returning ? shapeRows(descriptor, result) : ok(null);
    }

    // delete
    let text = `delete from ${table}${whereClause(descriptor, params)}`;
    if (descriptor.returning) text += ` returning ${await returningList(descriptor)}`;
    const result = (await sql.query(text, params.values)) as unknown[];
    return descriptor.returning ? shapeRows(descriptor, result) : ok(null);
  } catch (error) {
    return {
      data: descriptor.rowMode ? null : [],
      error: { message: error instanceof Error ? error.message : "Database error" },
      count: null,
      status: 400,
    };
  }
}

async function returningList(descriptor: QueryDescriptor): Promise<string> {
  const select = descriptor.columns || "*";
  if (select.includes("(")) return await buildSelectList(descriptor.table, select);
  const parsed = parseSelect(select);
  if (parsed.columns.length === 0 || parsed.columns.includes("*")) return "*";
  return parsed.columns.map(ident).join(", ");
}

/** jsonb columns arrive as plain objects; Postgres needs them serialised. */
function normalize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

/**
 * Runs a stored function. When the function reads `auth.uid()`, the acting user
 * is published to the same transaction so our own session drives it.
 */
export async function executeRpc(
  descriptor: RpcDescriptor,
  actingUserId: string | null,
): Promise<QueryResult> {
  try {
    if (!IDENT.test(descriptor.fn)) throw new Error(`Invalid function: ${descriptor.fn}`);
    const entries = Object.entries(descriptor.args ?? {});
    const args = entries.map(([key], index) => `${ident(key)} => $${index + 1}`).join(", ");
    const values = entries.map(([, value]) => normalize(value));
    const text = `select * from ${ident(descriptor.fn)}(${args})`;

    const rows = actingUserId
      ? ((
          await sql.transaction([
            sql.query(`select set_config('request.jwt.claim.sub', $1, true)`, [actingUserId]),
            sql.query(text, values),
          ])
        )[1] as unknown[])
      : ((await sql.query(text, values)) as unknown[]);

    const list = (rows ?? []) as Record<string, unknown>[];
    // A scalar-returning function comes back as [{ fnname: value }].
    const unwrapped = list.map((row) => {
      const keys = Object.keys(row);
      return keys.length === 1 && keys[0] === descriptor.fn ? row[keys[0]!] : row;
    });
    if (descriptor.rowMode === "single")
      return shapeRows({ rowMode: "single" } as QueryDescriptor, unwrapped);
    if (descriptor.rowMode === "maybe") return ok(unwrapped[0] ?? null);
    if (unwrapped.length === 1 && (unwrapped[0] === null || typeof unwrapped[0] !== "object")) {
      return ok(unwrapped[0] ?? null);
    }
    return ok(unwrapped);
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : "Database error" },
      count: null,
      status: 400,
    };
  }
}
