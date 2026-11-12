import { describe, expect, it } from "vitest";
import { groupOpenRequests, siblingsToClose } from "./verification-dedupe";

const rows = [
  { paymentId: "a", userId: "u1", tier: "creator", status: "pending" },
  { paymentId: "b", userId: "u1", tier: "creator", status: "pending" },
  { paymentId: "c", userId: "u1", tier: "business", status: "pending" },
  { paymentId: "d", userId: "u2", tier: "creator", status: "pending" },
];

describe("verification duplicates", () => {
  it("approving one of two duplicates closes the other for same user and category", () => {
    expect(siblingsToClose(rows, "a")).toEqual(["b"]);
  });
  it("does not touch other categories or other users", () => {
    expect(siblingsToClose(rows, "c")).toEqual([]);
  });
  it("groups duplicates into one entry with a count", () => {
    const g = groupOpenRequests(rows);
    expect(g).toHaveLength(3);
    expect(g[0].duplicates).toBe(2);
  });
});
