import { describe, expect, it } from "vitest";
import { cleanContextId, contextStatements } from "@/lib/db-context";

const U = "11111111-2222-3333-4444-555555555555";

describe("RLS request context", () => {
  it("passes the signed-in user id as transaction-local rout.current_user_id", () => {
    const [s] = contextStatements({ userId: U, workspaceId: null });
    expect(s?.query).toContain("set_config('rout.current_user_id', $1, true)");
    expect(s?.params).toEqual([U, ""]);
  });
  it("turns malformed ids into null access", () => {
    expect(cleanContextId("x' or 1=1")).toBeNull();
    expect(contextStatements({ userId: "nope", workspaceId: "also" })[0]?.params).toEqual(["", ""]);
  });
});
