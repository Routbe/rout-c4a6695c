import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MERGE_TABLES } from "@/lib/account-merge-rules";

// The live merge runs inside execute_account_merge (SQL). Every table the app
// manifest says must block a merge has to be guarded in that function's body,
// as replayed from all migrations into db/schema.snapshot.json.
const snap = JSON.parse(readFileSync("db/schema.snapshot.json", "utf8")) as {
  tables: { schema: string; name: string }[];
  functions: { schema: string; name: string; def: string }[];
};
const merge = snap.functions.find((f) => f.schema === "public" && f.name === "execute_account_merge")?.def ?? "";

describe("account merge guards", () => {
  it("every skip table that exists is guarded by the SQL merge before it deletes the secondary", () => {
    const existing = new Set(snap.tables.filter((t) => t.schema === "public").map((t) => t.name));
    const skip = Object.entries(MERGE_TABLES).filter(([t, r]) => r.strategy === "skip" && existing.has(t)).map(([t]) => t);
    const deleteAt = merge.indexOf("delete from public.users where id=v_secondary");
    expect(deleteAt).toBeGreaterThan(0);
    const unguarded = skip.filter((t) => {
      const at = merge.indexOf(`'merge_blocked:${t}'`);
      return at < 0 || at > deleteAt;
    });
    expect(unguarded).toEqual([]);
  });

  it("recovery vaults and card records block a merge", () => {
    for (const t of ["recovery_vaults", "recovery_attempts", "rout_card_generations", "card_freezes", "wallet_passes"]) {
      expect(MERGE_TABLES[t]?.strategy).toBe("skip");
    }
  });
});
