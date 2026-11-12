import { beforeEach, describe, expect, it, vi } from "vitest";
const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("@/lib/neon", () => ({ sql }));
import { addOwnedRedirect, getOwnedRedirectMismatch } from "./owner-redirect.server";

beforeEach(() => sql.mockReset());
describe("owner redirect repair", () => {
  it("does not disclose URIs when the ownership query finds nothing", async () => {
    sql.mockResolvedValue([]);
    expect(await getOwnedRedirectMismatch("other", "client", "https://app.test/cb")).toBeNull();
    expect(sql.mock.calls[0]?.slice(1)).toEqual(["client", "other"]);
  });
  it("returns a mismatch only for an owned row", async () => {
    sql.mockResolvedValue([{ redirect_uris: ["https://app.test/old"] }]);
    expect(await getOwnedRedirectMismatch("owner", "client", "https://app.test/cb")).toEqual({
      code: "redirect_uri_mismatch", expected: ["https://app.test/old"], received: "https://app.test/cb",
    });
  });
  it("rejects credentials before attempting a write", async () => {
    await expect(addOwnedRedirect("owner", "client", "https://user:pass@app.test/cb")).rejects.toThrow("invalid_redirect_uri");
    expect(sql).not.toHaveBeenCalled();
  });
  it("requires ownership in the write and refuses unmatched rows", async () => {
    sql.mockResolvedValue([]);
    await expect(addOwnedRedirect("other", "client", "https://APP.test:443/cb/")).rejects.toThrow("Forbidden");
    expect(sql.mock.calls[0]?.slice(1)).toEqual(["https://APP.test:443/cb/", "client", "other"]);
  });
});
