/**
 * Wire format shared by the browser query builder and the Neon executor.
 *
 * The browser never talks to Postgres directly: it describes the query it
 * wants, and a single server function compiles that description to SQL against
 * our Neon database in Frankfurt after checking it against the access policy.
 */

export type FilterOp =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "like"
  | "ilike"
  | "is"
  | "in"
  | "contains"
  | "or"
  | "not";

export type QueryFilter = {
  op: FilterOp;
  column: string;
  value: unknown;
  /** Only used by `not`: the negated operator. */
  negatedOp?: string;
};

export type QueryOrder = {
  column: string;
  ascending: boolean;
  nullsFirst?: boolean;
};

export type QueryAction = "select" | "insert" | "update" | "upsert" | "delete";

export type QueryDescriptor = {
  table: string;
  action: QueryAction;
  columns: string;
  values?: Record<string, unknown> | Record<string, unknown>[];
  onConflict?: string;
  ignoreDuplicates?: boolean;
  filters: QueryFilter[];
  order: QueryOrder[];
  limit?: number;
  range?: { from: number; to: number };
  count?: "exact" | "planned" | "estimated";
  head?: boolean;
  rowMode?: "single" | "maybe";
  /** True when `.select()` was chained onto a mutation. */
  returning: boolean;
};

export type RpcDescriptor = {
  fn: string;
  args: Record<string, unknown>;
  rowMode?: "single" | "maybe";
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type QueryResult<T = any> = {
  data: T;
  error: { message: string; code?: string; details?: string } | null;
  count: number | null;
  status: number;
};

export function emptyDescriptor(table: string): QueryDescriptor {
  return { table, action: "select", columns: "*", filters: [], order: [], returning: false };
}
