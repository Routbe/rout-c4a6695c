/**
 * Kysely dialect over the Neon gateway for Better Auth.
 *
 * Each compiled query is sent as one atomic gateway batch through `runQuery`
 * (role switch + RLS context + guard included). Interactive transactions are
 * refused, never faked: Better Auth is configured with `transaction: false`
 * and runs its steps sequentially.
 */
import {
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type Dialect,
  type Driver,
  type Kysely,
  type QueryResult,
} from "kysely";
import { runQuery } from "@/lib/neon";

const MUTATIONS = new Set(["INSERT", "UPDATE", "DELETE", "MERGE"]);

class GatewayConnection implements DatabaseConnection {
  async executeQuery<R>(compiled: CompiledQuery): Promise<QueryResult<R>> {
    const r = await runQuery(compiled.sql, [...compiled.parameters]);
    return {
      rows: r.rows as R[],
      ...(MUTATIONS.has(r.command) ? { numAffectedRows: BigInt(r.rowCount ?? 0) } : {}),
    };
  }
  // eslint-disable-next-line require-yield
  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error("streaming_unsupported: the Neon gateway returns complete results");
  }
}

class GatewayDriver implements Driver {
  private readonly connection = new GatewayConnection();
  async init() {}
  async acquireConnection() {
    return this.connection;
  }
  async beginTransaction(): Promise<void> {
    throw new Error("interactive_transactions_unsupported: use one atomic PostgreSQL batch");
  }
  async commitTransaction(): Promise<void> {
    throw new Error("interactive_transactions_unsupported");
  }
  async rollbackTransaction(): Promise<void> {
    throw new Error("interactive_transactions_unsupported");
  }
  async releaseConnection() {}
  async destroy() {}
}

export class NeonGatewayDialect implements Dialect {
  createAdapter() {
    return new PostgresAdapter();
  }
  createDriver() {
    return new GatewayDriver();
  }
  createQueryCompiler() {
    return new PostgresQueryCompiler();
  }
  createIntrospector(db: Kysely<any>) {
    return new PostgresIntrospector(db);
  }
}

/** Better Auth `database` option: gateway dialect, no interactive transactions. */
export function betterAuthDatabase() {
  return { dialect: new NeonGatewayDialect(), type: "postgres" as const, transaction: false };
}
