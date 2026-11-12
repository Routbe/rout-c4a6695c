import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MERGE_TABLES,
  mergeAttemptAllowed,
  mergeFailureReason,
  parseMergeSide,
  transferStatements,
} from "./account-merge-rules";

const P = "11111111-1111-1111-1111-111111111111";
const S = "22222222-2222-2222-2222-222222222222";

// ---- database mock --------------------------------------------------------
const state = vi.hoisted(() => ({
  batches: [] as { query: string; params: unknown[] }[][],
  batchError: null as Error | null,
  outcome: { ok: true, primaryUserId: "11111111-1111-1111-1111-111111111111" } as Record<string, unknown>,
  sqlWrites: [] as string[],
  failures: 0 as number | Error,
  ticket: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/neon", () => {
  const run = (query: string): unknown[] => {
    if (/^\s*(update|delete|insert)/i.test(query)) state.sqlWrites.push(query);
    if (query.includes("from public.rate_limits")) {
      if (state.failures instanceof Error) throw state.failures;
      return [{ hits: state.failures }];
    }
    if (query.includes("from public.account_merge_tickets")) return state.ticket ? [state.ticket] : [];
    if (query.includes("from public.profiles where id in")) return [{ id: P, username: "a" }, { id: S, username: "b" }];
    if (query.includes("from public.users")) return [];
    return [];
  };
  const sql = (strings: TemplateStringsArray) => Promise.resolve().then(() => run(strings.join("?")));
  (sql as unknown as { query: unknown }).query = (q: string) => Promise.resolve().then(() => run(q));
  return {
    sql,
    runQuery: vi.fn(async (query: string, params: unknown[]) => {
      state.batches.push([{ query, params }]);
      if (state.batchError) throw state.batchError;
      return { rows: [{ result: state.outcome }], rowCount: 1, command: "SELECT" };
    }),
    runBatch: vi.fn(async (stmts: { query: string; params: unknown[] }[]) => {
      state.batches.push(stmts);
      if (state.batchError) throw state.batchError;
      return stmts.map(() => ({ rows: [], rowCount: 0, command: "" }));
    }),
  };
});
vi.mock("./security-code.server", () => ({ consumeSecurityCode: vi.fn(async () => true), maskEmail: (e: string) => e }));
vi.mock("./rate-limit-db.server", () => ({ sha256Hex: async (v: string) => v, hitRateLimit: vi.fn(async () => ({ ok: true })) }));
vi.mock("./audit-log.server", () => ({ recordSecurityEvent: vi.fn(async () => {}) }));
vi.mock("./design-templates.server", () => ({
  snapshotDesign: async () => null,
  designWriteStatements: () => [],
  templateInsertStatement: () => ({ query: "insert template", params: [] }),
}));
vi.mock("@/lib/auth/token-hash.server", () => ({ generateToken: () => "t", hashToken: async (v: string) => `h:${v}` }));

const { redeemMergeTicket } = await import("./account-merge.server");

const input = { secondaryUserId: S, pin: "123456", code: "654321", keepHandle: "primary", keepDesign: "primary" } as const;

beforeEach(() => {
  state.batches = [];
  state.batchError = null;
  state.sqlWrites = [];
  state.failures = 0;
  state.outcome = { ok: true, primaryUserId: P };
  state.ticket = { id: "t1", primary_user_id: P, preview_user_id: S, expires_at: new Date(Date.now() + 60_000).toISOString() };
});

describe("merge table allowlist", () => {
  it("covers every public table that owns rows by user_id/profile_id", () => {
    const snap = JSON.parse(readFileSync("db/schema.snapshot.json", "utf8")) as {
      tables: { schema: string; name: string; columns: { name: string }[] }[];
    };
    const owned = snap.tables
      .filter((t) => t.schema === "public" && t.columns.some((c) => c.name === "user_id" || c.name === "profile_id"))
      .map((t) => t.name);
    expect(owned.filter((t) => !(t in MERGE_TABLES))).toEqual([]);
  });

  it("never mutates identity records", () => {
    for (const t of ["identity_verifications", "verified_identities", "identity_links"]) {
      expect(MERGE_TABLES[t]?.strategy).toBe("skip");
    }
    const writes = transferStatements(P, S).filter((s) => /^\s*(update|delete|insert)/i.test(s.query));
    for (const s of writes) expect(s.query).not.toMatch(/identity_verifications|verified_identities|identity_links"/);
  });

  it("blocks unreviewed card and issuer ownership transfers and retains hardware audit history", () => {
    for (const table of ["card_designs", "card_freezes", "factory_card_inventory", "physical_keys", "wallet_passes", "oidc_subjects"]) {
      expect(MERGE_TABLES[table]?.strategy).toBe("skip");
    }
    expect(MERGE_TABLES.physical_key_events?.strategy).toBe("retain");
  });

  it("checks all blocking tables before the first write", () => {
    const stmts = transferStatements(P, S);
    const firstWrite = stmts.findIndex((s) => !s.query.startsWith("select"));
    const lastAssert = stmts.map((s) => s.query.startsWith("select public.rout_merge_assert")).lastIndexOf(true);
    expect(lastAssert).toBeLessThan(firstWrite);
  });

  it("refuses merging an account into itself", () => {
    expect(() => transferStatements(P, P)).toThrow("same_account");
  });
});

describe("choice validation", () => {
  it("accepts only exactly primary or secondary", () => {
    expect(parseMergeSide("primary")).toBe("primary");
    expect(parseMergeSide("secondary")).toBe("secondary");
    for (const v of ["Primary", "", "both", null, undefined, 1]) expect(() => parseMergeSide(v)).toThrow("invalid_merge_choice");
  });

  it("redeem refuses an invalid choice without touching the database", async () => {
    await expect(redeemMergeTicket({ ...input, keepHandle: "other" as never })).rejects.toThrow("invalid_merge_choice");
    expect(state.batches).toHaveLength(0);
  });
});

describe("atomic redeem", () => {
  it("delegates the merge and email proof to one PostgreSQL function", async () => {
    const r = await redeemMergeTicket(input);
    expect(r.ok).toBe(true);
    expect(state.batches).toHaveLength(1);
    const statement = state.batches[0]?.[0];
    expect(statement?.query).toBe("select public.execute_account_merge($1, $2, $3, $4) as result");
    expect(statement?.params).toEqual(["h:123456", `h:${S}:merge:654321`, "primary", "primary"]);
    // Nothing was written outside the transaction.
    expect(state.sqlWrites.filter((w) => !w.includes("preview_user_id"))).toEqual([]);
  });

  it("rolls back on a partial failure and reports it", async () => {
    state.batchError = new Error("Neon 400 23505: duplicate key");
    const r = await redeemMergeTicket(input);
    expect(r).toEqual({ ok: false, reason: "failed" });
    expect(state.sqlWrites.some((w) => w.includes("delete from public.users"))).toBe(false);
  });

  it("refuses a replayed ticket", async () => {
    state.batchError = new Error("Neon 400 P0001: merge_ticket_not_claimable");
    expect(await redeemMergeTicket(input)).toEqual({ ok: false, reason: "invalid_or_expired" });
  });

  it("reports a database-rejected email proof without consuming it in TypeScript", async () => {
    state.outcome = { ok: false, reason: "bad_code" };
    expect(await redeemMergeTicket(input)).toEqual({ ok: false, reason: "bad_code" });
    expect(state.sqlWrites).toEqual([]);
  });
});

describe("rate limit", () => {
  it("blocks after 5 failures", async () => {
    state.failures = 5;
    expect(await redeemMergeTicket(input)).toEqual({ ok: false, reason: "rate_limited" });
    expect(state.batches).toHaveLength(0);
  });

  it("fails closed when the counter is unavailable", async () => {
    state.failures = new Error("db down");
    expect(await redeemMergeTicket(input)).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("pure rule", () => {
    expect(mergeAttemptAllowed(null)).toBe(false);
    expect(mergeAttemptAllowed(4)).toBe(true);
    expect(mergeAttemptAllowed(5)).toBe(false);
    expect(mergeFailureReason(new Error("merge_blocked:wallets"))).toBe("blocked");
  });
});
