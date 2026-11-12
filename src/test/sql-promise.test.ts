import { describe, expect, it } from "vitest";
import { sql } from "@/lib/neon";

describe("sql tag promise compatibility", () => {
  it("supports .catch and .finally like a real promise", () => {
    const q = sql`select 1`;
    expect(typeof q.catch).toBe("function");
    expect(typeof q.finally).toBe("function");
  });
});
