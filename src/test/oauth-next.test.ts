import { expect, test } from "vitest";
import { safeNextPath } from "@/lib/auth/post-auth";
test("keeps oauth", () => {
  const v = "/oauth/authorize?client_id=a&state=xyz&code_challenge=c";
  expect(safeNextPath(v)).toBe(v);
  expect(safeNextPath("/dashboard?state=1")).toBe("/dashboard");
});
