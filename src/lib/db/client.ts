/**
 * Browser-facing database client.
 *
 * Shaped like the old Postgres client so existing call sites keep working, but
 * every statement is routed through the guarded gateway server function and
 * executed on our own Neon Postgres.
 */
import { createDbClient } from "./builder";
import { runDbQuery, runDbRpc } from "./gateway.functions";
import type { QueryResult } from "./types";

function fail(error: unknown, isRow: boolean): QueryResult {
  return {
    data: isRow ? null : [],
    error: { message: error instanceof Error ? error.message : "Request failed" },
    count: null,
    status: 500,
  };
}

export const db = createDbClient(
  async (descriptor) => {
    try {
      return await runDbQuery({ data: descriptor });
    } catch (error) {
      return fail(error, Boolean(descriptor.rowMode));
    }
  },
  async (descriptor) => {
    try {
      return await runDbRpc({ data: descriptor });
    } catch (error) {
      return fail(error, true);
    }
  },
);

export default db;
