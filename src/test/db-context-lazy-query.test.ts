import { afterEach, describe, expect, it, vi } from "vitest";
import { sql, withDbContext } from "@/lib/neon";

const USER = "3ee53fa5-3c3c-49c4-a197-87d2461a1ae1";

describe("database context on deferred queries", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("keeps the signed-in account when a query is awaited after withDbContext returns", async () => {
    vi.stubEnv("NEON_API_KEY", "lovc_test");
    vi.stubEnv("LOVABLE_API_KEY", "test");
    const bodies: { queries: { query: string; params: unknown[] }[] }[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      bodies.push(body);
      const results = body.queries.map(() => ({ rows: [], rowCount: 0, command: "SELECT" }));
      return new Response(JSON.stringify({ results }), { status: 200 });
    });

    // The same shape the sign-in bridge uses: the callback returns the unexecuted query.
    await withDbContext({ userId: USER, workspaceId: null }, () => sql`select 1`);

    const contextStatement = bodies[0]?.queries.find((q) => q.query.includes("rout.current_user_id"));
    expect(contextStatement?.params[0]).toBe(USER);
  });
});
