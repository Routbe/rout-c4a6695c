import { describe, expect, it } from "vitest";
import { paginate } from "./paginate";

describe("paginate", () => {
  const list = Array.from({ length: 23 }, (_, i) => i);
  it("shows at most 10 per page", () => {
    expect(paginate(list, 1).items).toHaveLength(10);
    expect(paginate(list, 1).pages).toBe(3);
  });
  it("clamps out-of-range pages", () => {
    expect(paginate(list, 99).page).toBe(3);
    expect(paginate(list, 99).items).toHaveLength(3);
    expect(paginate([], 1)).toEqual({ items: [], page: 1, pages: 1 });
  });
});
