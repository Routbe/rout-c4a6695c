/**
 * A PostgREST-shaped query builder that runs on Neon.
 *
 * It intentionally mirrors the small slice of the `db-js` surface this
 * app used, so call sites keep reading the same way while every statement is
 * executed as plain SQL against our own Postgres in Frankfurt.
 */
import {
  emptyDescriptor,
  type QueryDescriptor,
  type QueryResult,
  type RpcDescriptor,
} from "./types";

export type Executor = (descriptor: QueryDescriptor) => Promise<QueryResult>;
export type RpcExecutor = (descriptor: RpcDescriptor) => Promise<QueryResult>;

type AnyRecord = Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
class QueryBuilder<T = any> implements PromiseLike<QueryResult<T>> {
  constructor(
    private readonly descriptor: QueryDescriptor,
    private readonly execute: Executor,
    private throwOnErr = false,
  ) {}

  private self<R>(): QueryBuilder<R> {
    return this as unknown as QueryBuilder<R>;
  }

  select(columns = "*", options?: { count?: "exact" | "planned" | "estimated"; head?: boolean }) {
    if (this.descriptor.action === "select") {
      this.descriptor.columns = columns;
    } else {
      this.descriptor.returning = true;
      this.descriptor.columns = columns;
    }
    if (options?.count) this.descriptor.count = options.count;
    if (options?.head) this.descriptor.head = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.self<any[]>();
  }

  insert(values: AnyRecord | AnyRecord[]) {
    this.descriptor.action = "insert";
    this.descriptor.values = values;
    this.descriptor.returning = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.self<any[]>();
  }

  upsert(
    values: AnyRecord | AnyRecord[],
    options?: { onConflict?: string; ignoreDuplicates?: boolean },
  ) {
    this.descriptor.action = "upsert";
    this.descriptor.values = values;
    if (options?.onConflict) this.descriptor.onConflict = options.onConflict;
    if (options?.ignoreDuplicates) this.descriptor.ignoreDuplicates = true;
    this.descriptor.returning = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.self<any[]>();
  }

  update(values: AnyRecord) {
    this.descriptor.action = "update";
    this.descriptor.values = values;
    this.descriptor.returning = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.self<any[]>();
  }

  delete() {
    this.descriptor.action = "delete";
    this.descriptor.returning = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.self<any[]>();
  }

  private filter(op: QueryDescriptor["filters"][number]["op"], column: string, value: unknown) {
    this.descriptor.filters.push({ op, column, value });
    return this;
  }

  eq(column: string, value: unknown) {
    return this.filter("eq", column, value);
  }
  neq(column: string, value: unknown) {
    return this.filter("neq", column, value);
  }
  gt(column: string, value: unknown) {
    return this.filter("gt", column, value);
  }
  gte(column: string, value: unknown) {
    return this.filter("gte", column, value);
  }
  lt(column: string, value: unknown) {
    return this.filter("lt", column, value);
  }
  lte(column: string, value: unknown) {
    return this.filter("lte", column, value);
  }
  like(column: string, value: string) {
    return this.filter("like", column, value);
  }
  ilike(column: string, value: string) {
    return this.filter("ilike", column, value);
  }
  is(column: string, value: unknown) {
    return this.filter("is", column, value);
  }
  in(column: string, values: readonly unknown[]) {
    return this.filter("in", column, values);
  }
  contains(column: string, value: unknown) {
    return this.filter("contains", column, value);
  }
  /** PostgREST-style `col.op.value,col2.op.value` disjunction. */
  or(expression: string) {
    return this.filter("or", "", expression);
  }
  not(column: string, op: string, value: unknown) {
    this.descriptor.filters.push({ op: "not", column, value, negatedOp: op });
    return this;
  }
  match(criteria: AnyRecord) {
    for (const [column, value] of Object.entries(criteria)) this.eq(column, value);
    return this;
  }

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.descriptor.order.push({
      column,
      ascending: options?.ascending !== false,
      ...(options?.nullsFirst === undefined ? {} : { nullsFirst: options.nullsFirst }),
    });
    return this;
  }

  limit(count: number) {
    this.descriptor.limit = count;
    return this;
  }

  range(from: number, to: number) {
    this.descriptor.range = { from, to };
    return this;
  }

  single() {
    this.descriptor.rowMode = "single";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.self<any>();
  }

  maybeSingle() {
    this.descriptor.rowMode = "maybe";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.self<any>();
  }

  /** db-js type helper; a no-op at runtime. */
  returns<R>() {
    return this.self<R>();
  }

  throwOnError() {
    this.throwOnErr = true;
    return this;
  }

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const promise = this.execute(this.descriptor).then((result) => {
      if (result.error && this.throwOnErr) throw new Error(result.error.message);
      return result as QueryResult<T>;
    });
    return promise.then(onfulfilled ?? undefined, onrejected ?? undefined);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
class RpcBuilder<T = any> implements PromiseLike<QueryResult<T>> {
  constructor(
    private readonly descriptor: RpcDescriptor,
    private readonly execute: RpcExecutor,
  ) {}

  single() {
    this.descriptor.rowMode = "single";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this as unknown as RpcBuilder<any>;
  }

  maybeSingle() {
    this.descriptor.rowMode = "maybe";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this as unknown as RpcBuilder<any>;
  }

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute(this.descriptor)
      .then((r) => r as QueryResult<T>, undefined)
      .then(onfulfilled ?? undefined, onrejected ?? undefined);
  }
}

/** Realtime is a Postgres-only feature; the Neon layer polls instead. */
type ChannelStub = {
  on: (...args: unknown[]) => ChannelStub;
  subscribe: (callback?: (status: string) => void) => ChannelStub;
  unsubscribe: () => Promise<"ok">;
};

function createChannel(): ChannelStub {
  const channel: ChannelStub = {
    on: () => channel,
    subscribe: (callback) => {
      callback?.("SUBSCRIBED");
      return channel;
    },
    unsubscribe: async () => "ok" as const,
  };
  return channel;
}

export function createDbClient(execute: Executor, executeRpc: RpcExecutor) {
  return {
    from(table: string) {
      return new QueryBuilder(emptyDescriptor(table), execute);
    },
    rpc(fn: string, args: Record<string, unknown> = {}) {
      return new RpcBuilder({ fn, args: args ?? {} }, executeRpc);
    },
    /** No-op realtime shim so legacy call sites keep compiling. */
    channel: (_name?: string) => createChannel(),
    removeChannel: async (_channel?: unknown) => "ok" as const,
  };
}

export type DbClient = ReturnType<typeof createDbClient>;
