import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/neon", () => ({ sql: query }));
import { postNote } from "./guestbook.server";

describe("guestbook verified membership", () => {
  beforeEach(() => query.mockReset());
  it("refuses an unverified author before reading the inbox or writing", async () => {
    query.mockResolvedValueOnce([]);
    expect(await postNote("author", "owner", "Hallo")).toBe("not_verified");
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0].join("")).toContain("verified = true");
  });
  it("allows a verified, unblocked author to post", async () => {
    query.mockResolvedValueOnce([{ id: "author" }]).mockResolvedValueOnce([{ id: "owner" }]).mockResolvedValueOnce([{ n: 0 }]).mockResolvedValueOnce([]);
    expect(await postNote("author", "owner", "Hallo")).toBe("ok");
    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[3].slice(1)).toEqual(["owner", "author", "Hallo"]);
  });
});