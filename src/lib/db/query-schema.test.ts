import { expect, it } from "vitest";
import { emptyDescriptor } from "./types";
import { querySchema } from "./query-schema";
it("validates profile updates and strips extra descriptor claims", () => {
  const parsed = querySchema.parse({ ...emptyDescriptor("profiles"), action: "update", values: { display_name: "Owner" }, admin: true });
  expect(parsed.values).toEqual({ display_name: "Owner" });
  expect(parsed).not.toHaveProperty("admin");
});
it("rejects array-shaped updates rather than compiling numeric field names", () => {
  expect(querySchema.safeParse({ ...emptyDescriptor("profiles"), action: "update", values: [{ display_name: "Owner" }] }).success).toBe(false);
});
it("rejects invalid actions and excessive filter collections", () => {
  expect(querySchema.safeParse({ ...emptyDescriptor("profiles"), action: "execute" }).success).toBe(false);
  expect(querySchema.safeParse({ ...emptyDescriptor("profiles"), filters: Array(101).fill({ op: "eq", column: "id", value: "owner" }) }).success).toBe(false);
});