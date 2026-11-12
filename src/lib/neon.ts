/**
 * Server-only Neon access through the linked gateway or runtime DATABASE_URL.
 * Both paths read credentials per request and use identical guarded SQL batches.
 *
 * `sql` mimics the @neondatabase/serverless HTTP client surface used across the
 * app: tagged templates, `sql.query(text, params)`, `sql.unsafe(raw)` and
 * `sql.transaction([...])`. One call = one HTTP request (no session state).
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { neon as directNeon } from "@neondatabase/serverless";
import { contextStatements, type DbContext } from "@/lib/db-context";
import { GENERIC_TEMPORARY_ERROR } from "@/lib/security/safe-errors";

/**
 * Request-scoped RLS context. Auth middleware runs handlers inside
 * `withDbContext`, and every query then runs in a transaction that first sets
 * `rout.current_user_id` / `rout.workspace_id` with `set_config(..., true)` (= SET LOCAL).
 * Without a context (anonymous, cron) nothing is set, so both read as null.
 */
const dbContext = new AsyncLocalStorage<DbContext>();
export function withDbContext<T>(ctx: DbContext, fn: () => T): T {
  return dbContext.run(ctx, fn);
}
function activeContext(): Statement[] {
  const ctx = dbContext.getStore();
  return ctx ? contextStatements(ctx) : [];
}

const GATEWAY_URL = "https://connector-gateway.lovable.dev/neon/sql";

type Row = Record<string, unknown>;
type Statement = { query: string; params: unknown[] };
type GatewayResult = { rows: Row[]; rowCount: number | null; command: string };

/** Resolve credentials on every request, never while bundling the application. */
export function hasDatabase(): boolean {
  return databaseTransport() !== "none";
}
export function databaseTransport(): "gateway" | "direct" | "none" {
  if (process.env["NEON_API_KEY"]?.trim() && process.env["LOVABLE_API_KEY"]?.trim()) return "gateway";
  return process.env["DATABASE_URL"]?.trim() ? "direct" : "none";
}

/** Transaction-scoped switch to the least-privilege role (no-op when already rout_app). */
export const RUNTIME_ROLE_SWITCH = "set local role rout_app";

export const RUNTIME_ROLE_GUARD = `do $guard$
begin
  if current_user <> 'rout_app' or exists (
    select 1 from pg_roles where rolname = current_user and (rolbypassrls or rolsuper)
  ) or exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','neon_auth') and c.relkind in ('r','p')
      and pg_has_role(current_user, c.relowner, 'USAGE')
  ) then
    raise exception 'runtime_role_unsafe' using errcode = '42501';
  end if;
end $guard$`;

function gatewayHeaders(): Record<string, string> {
  const lovable = process.env["LOVABLE_API_KEY"];
  const connection = process.env["NEON_API_KEY"];
  if (!lovable || !connection) {
    throw new Error("DATABASE_URL ontbreekt: geen runtime databaseverbinding ingesteld.");
  }
  return {
    Authorization: `Bearer ${lovable}`,
    "X-Connection-Api-Key": connection,
    "Content-Type": "application/json",
  };
}

async function post(body: unknown): Promise<any> {
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: gatewayHeaders(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    // Provider text may echo SQL values, names or message contents. Keep only
    // the status and allowlisted SQLSTATE for diagnostics and retry decisions.
    const code = typeof json?.code === "string" && /^[A-Z0-9]{5}$/.test(json.code) ? json.code : undefined;
    console.error("[database] request failed", { status: res.status, code });
    const err = new Error(GENERIC_TEMPORARY_ERROR) as Error & {
      code?: string;
      status?: number;
    };
    err.code = code;
    err.status = res.status;
    throw err;
  }
  return json;
}

/** Normalise params: objects/arrays of objects go as JSON text for json(b) columns. */
function normaliseParams(params: unknown[]): unknown[] {
  return params.map((p) => (p instanceof Date ? p.toISOString() : p === undefined ? null : p));
}

export async function runQuery(query: string, params: unknown[] = []): Promise<GatewayResult> {
  const [result] = await runBatch([{ query, params }]);
  if (!result) throw new Error("Neon returned no statement result");
  return result;
}

/** One gateway request is one PostgreSQL transaction, never an interactive callback. */
export async function runBatch(
  input: Statement[],
  opts: { withContext?: boolean } = {},
): Promise<GatewayResult[]> {
  for (const statement of input) {
    if (TRANSACTION_CONTROL.test(statement.query)) throw new Error("interactive_transactions_unsupported: use one atomic PostgreSQL batch");
  }
  const prefix = [
    // The linked login may be the database owner; every batch steps down to
    // rout_app so RLS applies. The guard below still fails closed otherwise.
    { query: RUNTIME_ROLE_SWITCH, params: [] },
    ...(opts.withContext === false ? [] : activeContext()),
    { query: RUNTIME_ROLE_GUARD, params: [] },
  ];
  const queries = [...prefix, ...input].map(s => ({ query: s.query, params: normaliseParams(s.params) }));
  let json: { results: GatewayResult[] };
  if (databaseTransport() === "direct") {
    const connectionString = process.env["DATABASE_URL"]?.trim();
    if (!connectionString) throw new Error(GENERIC_TEMPORARY_ERROR);
    try {
      // The identical atomic role/context/guard prefix applies to both paths.
      // An owner URL never gets permission to query as the owner.
      const client = directNeon(connectionString, { fullResults: true });
      const results = await client.transaction(queries.map(s => client.query(s.query, s.params)));
      json = { results: results.map(r => ({ rows: r.rows as Row[], rowCount: r.rowCount, command: r.command })) };
    } catch (cause) {
      const code = (cause as { code?: unknown })?.code;
      const safeCode = typeof code === "string" && /^[A-Z0-9]{5}$/.test(code) ? code : undefined;
      console.error("[database] direct request failed", { code: safeCode });
      throw Object.assign(new Error(GENERIC_TEMPORARY_ERROR), { code: safeCode });
    }
  } else {
    json = await post({ queries });
  }
  if (!Array.isArray(json.results) || json.results.length !== prefix.length + input.length) {
    throw new Error("Invalid Neon transaction response");
  }
  return json.results.slice(prefix.length);
}

export const withPostgresTransaction = runBatch;
const TRANSACTION_CONTROL = /^\s*(?:begin|commit|rollback|start\s+transaction|end|savepoint|release\s+savepoint)\b/i;

/** Lazy query: executes when awaited, or as part of `sql.transaction([...])`. */
class LazyQuery implements PromiseLike<Row[]> {
  /**
   * The RLS context is captured when the query is built, not when it is awaited:
   * `withDbContext(ctx, () => sql\`...\`)` returns the unexecuted query and the
   * caller awaits it after the context has already ended.
   */
  private readonly ctx: DbContext | undefined = dbContext.getStore();
  constructor(readonly statement: Statement) {}
  private exec?: Promise<Row[]>;
  run(): Promise<Row[]> {
    const execute = () => runQuery(this.statement.query, this.statement.params).then((r) => r.rows);
    this.exec ??= this.ctx ? dbContext.run(this.ctx, execute) : execute();
    return this.exec;
  }
  then<A = Row[], B = never>(
    onfulfilled?: ((value: Row[]) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    return this.run().then(onfulfilled, onrejected);
  }
  /** Promise compatibility: `sql\`...\`.catch()` must work like a real promise. */
  catch<B = never>(onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null): Promise<Row[] | B> {
    return this.run().catch(onrejected);
  }
  finally(onfinally?: (() => void) | null): Promise<Row[]> {
    return this.run().finally(onfinally);
  }
}

class RawSql {
  constructor(readonly text: string) {}
}

function buildTemplate(strings: TemplateStringsArray, values: unknown[]): Statement {
  let query = "";
  const params: unknown[] = [];
  strings.forEach((chunk, i) => {
    query += chunk;
    if (i < values.length) {
      const v = values[i];
      if (v instanceof RawSql) query += v.text;
      else {
        params.push(v);
        query += `$${params.length}`;
      }
    }
  });
  return { query, params };
}

type SqlTag = {
  (strings: TemplateStringsArray, ...values: unknown[]): LazyQuery & Promise<any[]>;
  query(text: string, params?: unknown[]): LazyQuery & Promise<any[]>;
  unsafe(text: string): any;
  transaction(queries: PromiseLike<unknown>[]): Promise<any[][]>;
};

function makeSql(): SqlTag {
  const tag = ((strings: TemplateStringsArray, ...values: unknown[]) =>
    new LazyQuery(buildTemplate(strings, values))) as unknown as SqlTag;
  tag.query = (text: string, params: unknown[] = []) => new LazyQuery({ query: text, params }) as never;
  tag.unsafe = (text: string) => new RawSql(text);
  tag.transaction = async (queries) => {
    const statements = queries.map((q) => {
      if (!(q instanceof LazyQuery)) throw new Error("sql.transaction expects queries created by sql`` or sql.query()");
      return q.statement;
    });
    const results = await runBatch(statements);
    return results.map((r) => r.rows);
  };
  return tag;
}

export const sql: SqlTag = makeSql();

/** Drop-in for `neon(url)` from @neondatabase/serverless: the URL is ignored, the active transport is used. */
export function neon(_connectionString?: string): SqlTag {
  return sql;
}

/** Better Auth must never receive a successful fake BEGIN/COMMIT. */
export class GatewayPool {
  async query(text: string | { text: string; values?: unknown[] }, values?: unknown[]) {
    const q = typeof text === "string" ? text : text.text;
    const p = typeof text === "string" ? (values ?? []) : (text.values ?? values ?? []);
    if (TRANSACTION_CONTROL.test(q)) {
      throw new Error("interactive_transactions_unsupported: use a reviewed PostgreSQL function or atomic batch");
    }
    const r = await runQuery(q, p);
    return { ...r, fields: [] };
  }
  async connect(): Promise<never> {
    throw new Error("interactive_transactions_unsupported: Better Auth requires a reviewed gateway-compatible adapter");
  }
  async end() {}
  on() { return this; }
}
