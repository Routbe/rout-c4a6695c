// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { afterEach, expect, it, vi } from "vitest";
import { GatewayPool, runBatch, withDbContext } from "@/lib/neon";
import { contextStatements } from "@/lib/db-context";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("refuses fake interactive transactions before any network request", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const pool = new GatewayPool();
  await expect(pool.query("BEGIN")).rejects.toThrow("interactive_transactions_unsupported");
  await expect(pool.query("ROLLBACK")).rejects.toThrow("interactive_transactions_unsupported");
  await expect(pool.connect()).rejects.toThrow("interactive_transactions_unsupported");
  expect(fetch).not.toHaveBeenCalled();
});
it("steps down to rout_app, then sends context and role guard in the same atomic batch", async () => {
  vi.stubEnv("NEON_API_KEY", "test"); vi.stubEnv("LOVABLE_API_KEY", "test");
  const userId="11111111-1111-4111-8111-111111111111";
  const fetch=vi.fn(async (_url, options) => {
    const body=JSON.parse(options.body);
    expect(body.queries[0].query).toBe("set local role rout_app");
    expect(body.queries[1].query).toContain("set_config('rout.current_user_id', $1, true)");
    expect(body.queries[1].params[0]).toBe(userId);
    expect(body.queries[2].query).toContain("runtime_role_unsafe");
    return Response.json({results: [{rows:[]},{rows:[]},{rows:[]},{rows:[{ok:true}],command:"SELECT",rowCount:1}]});
  });
  vi.stubGlobal("fetch",fetch);
  const results=await withDbContext({userId,workspaceId:null},()=>runBatch([{query:"select true as ok",params:[]}]));
  expect(results[0]?.rows).toEqual([{ok:true}]);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("PostgreSQL rolls back a late failure and clears transaction-local current_user_id", async () => {
  const db=new PGlite(); const userId="11111111-1111-4111-8111-111111111111";
  try {
    await db.exec("create table tx_probe(id int primary key)");
    await db.exec("BEGIN");
    const statement=contextStatements({userId,workspaceId:null})[0];
    if (!statement) throw new Error("Missing context statement");
    await db.query(statement.query,statement.params);
    expect((await db.query<{uid:string}>("select current_setting('rout.current_user_id',true) as uid")).rows[0]?.uid).toBe(userId);
    await db.exec("insert into tx_probe values(1)");
    await expect(db.exec("insert into tx_probe values(1)")).rejects.toThrow();
    await db.exec("ROLLBACK");
    expect((await db.query("select * from tx_probe")).rows).toEqual([]);
    expect((await db.query<{uid:string|null}>("select nullif(current_setting('rout.current_user_id',true),'') as uid")).rows[0]?.uid).toBeNull();
  } finally { await db.close(); }
}, 30000);