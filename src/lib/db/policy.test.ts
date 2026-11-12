import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDescriptor, type QueryDescriptor } from "./types";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/neon", () => ({ sql: { query } }));

import { authorizeQuery } from "./policy.server";
import { executeDescriptor } from "./execute.server";

const memberId = "member-id";
function update(values: QueryDescriptor["values"]): QueryDescriptor {
  return {
    ...emptyDescriptor("profiles"),
    action: "update",
    values,
    filters: [{ op: "eq", column: "id", value: "someone-else" }],
  };
}

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue([]); // No server-side admin role.
});

describe("member profile write allowlist", () => {
  it("limits raw profile reads to the session owner while keeping the public view readable", async () => {
    const descriptor = { ...emptyDescriptor("profiles"), filters: [{ op: "eq" as const, column: "id", value: "other" }] };
    const decision = await authorizeQuery(descriptor, memberId);
    if (!decision.ok) throw new Error("Expected owner read");
    expect(decision.descriptor.filters).toEqual([{ op: "eq", column: "id", value: memberId }]);
    expect((await authorizeQuery(descriptor, null)).ok).toBe(false);
    expect((await authorizeQuery(emptyDescriptor("public_profiles"), null)).ok).toBe(true);
  });
  it("retains existing editable fields and forces the authenticated owner", async () => {
    const fields = {
      username: "member", display_name: "Member", tagline: "Hello",
      bio: "About me", avatar_url: "/api/avatar/photo.png", show_email_publicly: false,
    };
    const decision = await authorizeQuery(update(fields), memberId);
    expect(decision.ok).toBe(true);
    if (!decision.ok) throw new Error("Expected allowed update");
    expect(decision.descriptor.values).toEqual(fields);
    expect(decision.descriptor.filters).toEqual([{ op: "eq", column: "id", value: memberId }]);
  });

  it("strips protected and unlisted fields before SQL execution", async () => {
    const original = update({
      display_name: "Member", id: "someone-else", is_admin: true, verified: true,
      tier: "business", date_of_birth: "1990-01-01", workspace_id: "other-workspace",
      future_privilege: true,
    });
    const decision = await authorizeQuery(original, memberId);
    if (!decision.ok) throw new Error("Expected sanitized update");
    expect(decision.descriptor.values).toEqual({ display_name: "Member" });
    await executeDescriptor(decision.descriptor);
    expect(query).toHaveBeenLastCalledWith(
      'update "profiles" set "display_name" = $1 where "profiles"."id" = $2',
      ["Member", memberId],
    );
    expect(original.values).toHaveProperty("future_privilege", true);
  });

  it("does not execute an update containing only disallowed fields", async () => {
    const decision = await authorizeQuery(update({ future_privilege: true, verified: true }), memberId);
    if (!decision.ok) throw new Error("Expected sanitized update");
    expect(decision.descriptor.values).toEqual({});
    query.mockClear();
    await executeDescriptor(decision.descriptor);
    expect(query).not.toHaveBeenCalled();
  });

  it("sanitizes every row in a supplied array", async () => {
    const decision = await authorizeQuery(update([
      { display_name: "Member", future_privilege: true },
      { bio: "Hello", verified: true },
    ]), memberId);
    if (!decision.ok) throw new Error("Expected sanitized update");
    expect(decision.descriptor.values).toEqual([{ display_name: "Member" }, { bio: "Hello" }]);
  });

  it("rejects unauthenticated profile writes", async () => {
    expect(await authorizeQuery(update({ display_name: "Member" }), null))
      .toEqual({ ok: false, message: "Sign in required" });
  });

  it.each(["insert", "upsert", "delete"] as const)("keeps %s forbidden for profiles", async (action) => {
    expect((await authorizeQuery({ ...update({ verified: true }), action }, memberId)).ok).toBe(false);
  });

  it("strips protected fields even from administrator browser writes", async () => {
    query.mockResolvedValue([{ role: "admin" }]);
    const result = await authorizeQuery(update({ verified: true, display_name: "X" }), memberId);
    expect(result.ok).toBe(true);
    expect(result.ok && result.descriptor.values).toEqual({ display_name: "X" });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("public.user_roles"), [memberId]);
  });
});